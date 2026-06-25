/**
 * Cursor AgentService streaming transport (Connect-RPC over HTTP).
 *
 * Cursor exposes a non-public Connect-RPC API. This client speaks it directly
 * because subscription OAuth tokens cannot be used through `@cursor/sdk`.
 *
 * Transport choice (see module docs / final report):
 *   - DEFAULT (Bun): HTTP/1.1 Connect via `fetch`. We open a server-stream
 *     `POST /agent.v1.AgentService/RunSSE` to RECEIVE frames, and push client
 *     frames (initial run request + heartbeats) with unary
 *     `POST /aiserver.v1.BidiService/BidiAppend`. This is chosen because Bun's
 *     `node:http2` client is not reliably full-duplex, and `fetch` streaming is
 *     well-supported in Bun.
 *   - OPT-IN (`PI_CURSOR_H2_BIDI=1` on a non-Bun runtime): native HTTP/2 bidi
 *     `POST /agent.v1.AgentService/Run` via `node:http2`.
 *   - GetUsableModels is always a unary call; it uses `node:http2` when allowed
 *     (best for Connect unary with trailers) and falls back to `fetch`.
 *
 * Both paths share the same protobuf encoders/decoders and Connect framing.
 */

import { randomUUID } from 'node:crypto';
import {
  CONNECT_FLAG_END_STREAM,
  CONNECT_FLAG_TRAILER,
  concatBytes,
  encodeConnectFrame,
  parseConnectFrames,
  parseConnectTrailer,
  parseEndStreamError,
} from './proto';
import {
  buildRunRequestMessage,
  encodeAgentClientHeartbeat,
  encodeBidiAppendRequest,
  encodeBidiRequestId,
  parseAgentServerMessage,
  parseGetUsableModelsResponse,
  type CursorModelDetails,
  type CursorRunParams,
  type CursorTurnUsage,
} from './messages';
import { logger } from '../../../utils/logger';

const DEFAULT_BASE_URL = 'https://api2.cursor.sh';
const DEFAULT_CLIENT_VERSION = 'cli-2026.01.09-231024f';
const HEARTBEAT_INTERVAL_MS = 5_000;
const STREAM_IDLE_TIMEOUT_MS = 120_000;

/** Resolve the configured Cursor base URL. */
export function getCursorBaseUrl(): string {
  return process.env.CURSOR_API_URL || DEFAULT_BASE_URL;
}

/** Resolve the x-cursor-client-version header value. */
export function getCursorClientVersion(): string {
  return process.env.CURSOR_CLIENT_VERSION || DEFAULT_CLIENT_VERSION;
}

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

/**
 * Whether to use native HTTP/2 bidi. Off by default (Bun's http2 client is
 * unreliable for full-duplex); opt in with PI_CURSOR_H2_BIDI=1 on Node.
 */
function shouldUseNativeH2Bidi(): boolean {
  if (process.env.PI_CURSOR_H2_BIDI === '1') return !isBunRuntime();
  return false;
}

/** Options for constructing a transport. */
export interface CursorTransportOptions {
  accessToken: string;
  baseUrl?: string;
  clientVersion?: string;
  privacyMode?: boolean;
}

/** High-level events surfaced by the transport stream. */
export type CursorStreamChunk =
  | { type: 'text'; content: string }
  | { type: 'usage'; usage: CursorTurnUsage }
  | { type: 'done' }
  | { type: 'error'; error: string };

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Streaming client for Cursor's AgentService. One instance corresponds to one
 * access token; `streamRun` may be called once per turn.
 */
export class CursorAgentTransport {
  private readonly accessToken: string;
  private baseUrl: string;
  private readonly clientVersion: string;
  private readonly privacyMode: boolean;

  constructor(options: CursorTransportOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl || getCursorBaseUrl();
    this.clientVersion = options.clientVersion || getCursorClientVersion();
    this.privacyMode = options.privacyMode ?? true;
  }

  /** Common Connect headers. `kind` selects streaming vs unary content-type. */
  private headers(requestId: string, kind: 'stream' | 'unary'): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.accessToken}`,
      'content-type': kind === 'unary' ? 'application/proto' : 'application/connect+proto',
      'connect-protocol-version': '1',
      'user-agent': 'connect-es/1.6.1',
      'x-cursor-client-version': this.clientVersion,
      'x-cursor-client-type': 'cli',
      'x-ghost-mode': this.privacyMode ? 'true' : 'false',
      'x-request-id': requestId,
      'x-original-request-id': requestId,
    };
    if (kind === 'stream') headers['x-cursor-streaming'] = 'true';
    if (kind === 'unary') headers['te'] = 'trailers';
    if (process.env.CURSOR_AGENT_CLI_LOCAL_MODE === 'true') headers['local-cli-mode'] = 'true';
    return headers;
  }

  /**
   * Stream one chat turn. Yields text/usage chunks and terminates with a `done`
   * or `error` chunk. Heartbeats and checkpoints are consumed internally.
   */
  async *streamRun(
    params: CursorRunParams,
    signal?: AbortSignal
  ): AsyncGenerator<CursorStreamChunk> {
    if (signal?.aborted) {
      yield { type: 'error', error: 'Cursor request aborted.' };
      return;
    }
    if (shouldUseNativeH2Bidi()) {
      yield* this.streamRunNativeH2(params, signal);
      return;
    }
    yield* this.streamRunSse(params, signal);
  }

  // ── HTTP/1.1 fallback: RunSSE (receive) + BidiAppend (send) ─────────────────

  private async *streamRunSse(
    params: CursorRunParams,
    signal?: AbortSignal
  ): AsyncGenerator<CursorStreamChunk> {
    const requestId = randomUUID();
    const messageBody = buildRunRequestMessage(params);
    let appendSeqno = 0n;

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    const sendClientFrame = async (payload: Uint8Array): Promise<void> => {
      const seqno = appendSeqno;
      appendSeqno += 1n;
      const body = encodeBidiAppendRequest(toHex(payload), requestId, seqno);
      const res = await fetch(`${this.baseUrl}/aiserver.v1.BidiService/BidiAppend`, {
        method: 'POST',
        headers: this.headers(requestId, 'unary'),
        body: Buffer.from(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Cursor BidiAppend failed: HTTP ${res.status}${text ? ` ${text}` : ''}`);
      }
      // Drain so the connection can be reused.
      await res.arrayBuffer().catch(() => undefined);
    };

    try {
      // Open the receive stream first; attach a no-op catch so an early
      // connection failure does not become an unhandled rejection.
      const ssePromise = fetch(`${this.baseUrl}/agent.v1.AgentService/RunSSE`, {
        method: 'POST',
        headers: this.headers(requestId, 'stream'),
        body: Buffer.from(encodeConnectFrame(encodeBidiRequestId(requestId))),
        signal: controller.signal,
      });
      ssePromise.catch(() => undefined);

      // Push the initial run request, then start heartbeats.
      await sendClientFrame(messageBody);
      heartbeatTimer = setInterval(() => {
        void sendClientFrame(encodeAgentClientHeartbeat()).catch((error) => {
          logger.debug('Cursor: heartbeat send failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, HEARTBEAT_INTERVAL_MS);

      const response = await ssePromise;
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        yield {
          type: 'error',
          error: `Cursor RunSSE failed: HTTP ${response.status}${text ? ` ${text}` : ''}`,
        };
        return;
      }
      if (!response.body) {
        yield { type: 'error', error: 'Cursor RunSSE returned no response body' };
        return;
      }

      yield* this.consumeFrameStream(response.body, params, signal);
    } catch (error) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'Cursor request aborted.' };
        return;
      }
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(idleTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      signal?.removeEventListener('abort', onAbort);
      controller.abort();
    }
  }

  /**
   * Read Connect frames from a ReadableStream of bytes and yield decoded
   * chunks. Stops on turn_ended, an EndStream error, or a non-zero gRPC status.
   */
  private async *consumeFrameStream(
    body: ReadableStream<Uint8Array<ArrayBufferLike>>,
    params: CursorRunParams,
    signal?: AbortSignal
  ): AsyncGenerator<CursorStreamChunk> {
    const reader = body.getReader();
    let pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let turnEnded = false;
    try {
      while (!turnEnded) {
        const { done, value } = await reader.read();
        if (done) {
          if (!turnEnded) {
            yield {
              type: 'error',
              error: signal?.aborted
                ? 'Cursor request aborted.'
                : 'Cursor stream ended without turn_ended',
            };
          }
          break;
        }
        if (value && value.length > 0) {
          pending = pending.length === 0 ? value : concatBytes(pending, value);
        }

        const { frames, consumed } = parseConnectFrames(pending);
        if (consumed > 0) pending = pending.slice(consumed);

        for (const frame of frames) {
          const result = this.handleFrame(frame, params);
          for (const chunk of result.chunks) yield chunk;
          if (result.turnEnded) turnEnded = true;
          if (result.stop) {
            return;
          }
        }
      }
      if (turnEnded) yield { type: 'done' };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Decode a single Connect frame. Returns chunks to yield plus control flags.
   * Trailer/EndStream frames may carry errors; turn_ended ends the turn.
   */
  private handleFrame(
    frame: { flags: number; payload: Uint8Array },
    params: CursorRunParams
  ): { chunks: CursorStreamChunk[]; turnEnded: boolean; stop: boolean } {
    const chunks: CursorStreamChunk[] = [];

    if (frame.flags & CONNECT_FLAG_TRAILER) {
      const meta = parseConnectTrailer(frame.payload);
      const grpcStatus = Number(meta['grpc-status'] ?? '0');
      if (grpcStatus !== 0) {
        if (grpcStatus === 8 && params.modelId !== 'auto') {
          chunks.push({ type: 'error', error: "You've hit your usage limit" });
        } else if (grpcStatus !== 8) {
          const message = meta['grpc-message']
            ? decodeURIComponent(meta['grpc-message'])
            : 'Unknown gRPC error';
          chunks.push({ type: 'error', error: `${message} (grpc-status ${grpcStatus})` });
        }
        return { chunks, turnEnded: false, stop: true };
      }
      return { chunks, turnEnded: false, stop: false };
    }

    if (frame.flags & CONNECT_FLAG_END_STREAM) {
      const error = parseEndStreamError(frame.payload);
      if (error) {
        chunks.push({ type: 'error', error });
        return { chunks, turnEnded: false, stop: true };
      }
      return { chunks, turnEnded: false, stop: false };
    }

    let turnEnded = false;
    for (const event of parseAgentServerMessage(frame.payload)) {
      if (event.type === 'text') {
        if (event.text) chunks.push({ type: 'text', content: event.text });
      } else if (event.type === 'usage') {
        chunks.push({ type: 'usage', usage: event.usage });
      } else if (event.type === 'turn_ended') {
        if (event.usage) chunks.push({ type: 'usage', usage: event.usage });
        turnEnded = true;
      }
      // heartbeat / checkpoint are consumed silently in the MVP path.
    }
    return { chunks, turnEnded, stop: false };
  }

  // ── Native HTTP/2 bidi (opt-in) ─────────────────────────────────────────────

  private async *streamRunNativeH2(
    params: CursorRunParams,
    signal?: AbortSignal
  ): AsyncGenerator<CursorStreamChunk> {
    const http2 = await import('node:http2');
    const requestId = randomUUID();
    const messageBody = buildRunRequestMessage(params);

    const client = http2.connect(this.baseUrl);
    client.on('error', (error) =>
      logger.debug('Cursor: HTTP/2 session error', { error: error.message })
    );

    const headers = this.headers(requestId, 'stream');
    delete headers['x-cursor-streaming'];
    const stream = client.request({
      ':method': 'POST',
      ':path': '/agent.v1.AgentService/Run',
      ...headers,
    });
    stream.on('error', (error) =>
      logger.debug('Cursor: HTTP/2 stream error', { error: error.message })
    );

    const writeFrame = (payload: Uint8Array): void => {
      if (stream.destroyed || stream.closed) return;
      stream.write(Buffer.from(encodeConnectFrame(payload)));
    };

    const onAbort = () => {
      try {
        stream.close();
      } catch {
        // ignore
      }
      try {
        client.close();
      } catch {
        // ignore
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const idleTimer = setTimeout(onAbort, STREAM_IDLE_TIMEOUT_MS);
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    try {
      const responseStatus = await new Promise<number>((resolve, reject) => {
        stream.once('response', (resp) => resolve(Number(resp[':status'] ?? 0)));
        stream.once('error', reject);
        writeFrame(messageBody);
        heartbeatTimer = setInterval(
          () => writeFrame(encodeAgentClientHeartbeat()),
          HEARTBEAT_INTERVAL_MS
        );
      });

      if (responseStatus < 200 || responseStatus >= 300) {
        yield { type: 'error', error: `Cursor Run failed: HTTP ${responseStatus}` };
        return;
      }

      yield* this.consumeFrameStream(nodeStreamToWebStream(stream), params, signal);
    } catch (error) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'Cursor request aborted.' };
        return;
      }
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(idleTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      signal?.removeEventListener('abort', onAbort);
      onAbort();
    }
  }

  // ── GetUsableModels (unary) ─────────────────────────────────────────────────

  /** Fetch the models available to the authenticated subscription. */
  async getUsableModels(signal?: AbortSignal): Promise<CursorModelDetails[]> {
    const path = '/agent.v1.AgentService/GetUsableModels';
    const bytes = shouldUseNativeH2Bidi()
      ? await this.unaryViaH2(path, new Uint8Array(0))
      : await this.unaryViaFetch(path, new Uint8Array(0), signal);

    const models = new Map<string, CursorModelDetails>();
    for (const frame of this.extractUnaryPayloads(bytes)) {
      for (const model of parseGetUsableModelsResponse(frame)) models.set(model.id, model);
    }
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * GetUsableModels is a Connect unary call with an EMPTY request body. Some
   * deployments answer with a bare proto body, others with Connect-framed data
   * frames — try framed first, fall back to the raw body.
   */
  private extractUnaryPayloads(bytes: Uint8Array): Uint8Array[] {
    const { frames } = parseConnectFrames(bytes);
    const dataFrames = frames
      .filter((f) => (f.flags & CONNECT_FLAG_TRAILER) === 0 && f.payload.length > 0)
      .map((f) => f.payload);
    if (dataFrames.length > 0) return dataFrames;
    return bytes.length > 0 ? [bytes] : [];
  }

  private async unaryViaFetch(
    path: string,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const requestId = randomUUID();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(requestId, 'unary'),
      body: Buffer.from(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Cursor unary ${path} failed: HTTP ${res.status}${text ? ` ${text}` : ''}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  private async unaryViaH2(path: string, body: Uint8Array): Promise<Uint8Array> {
    const http2 = await import('node:http2');
    return new Promise<Uint8Array>((resolve, reject) => {
      const client = http2.connect(this.baseUrl);
      const chunks: Buffer[] = [];
      let status = 0;
      let settled = false;
      const timeout = setTimeout(() => fail(new Error(`Cursor unary ${path} timed out`)), 15_000);
      const cleanup = () => {
        clearTimeout(timeout);
        try {
          client.close();
        } catch {
          // ignore
        }
      };
      function fail(error: Error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
      client.on('error', fail);
      const stream = client.request({
        ':method': 'POST',
        ':path': path,
        ...this.headers(randomUUID(), 'unary'),
      });
      stream.on('response', (h) => {
        status = Number(h[':status'] ?? 0);
      });
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('error', fail);
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (status < 200 || status >= 300) {
          reject(new Error(`Cursor unary ${path} failed: HTTP ${status}`));
          return;
        }
        resolve(new Uint8Array(Buffer.concat(chunks)));
      });
      stream.end(Buffer.from(body));
    });
  }
}

/** Adapt a Node.js Readable (http2 stream) into a Web ReadableStream<Uint8Array>. */
function nodeStreamToWebStream(
  nodeStream: NodeJS.ReadableStream
): ReadableStream<Uint8Array<ArrayBufferLike>> {
  return new ReadableStream<Uint8Array<ArrayBufferLike>>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | Uint8Array) => {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
      nodeStream.on('error', (error) => controller.error(error));
    },
  });
}
