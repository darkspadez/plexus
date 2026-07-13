import { logger } from '../utils/logger';
import type { StallConfig } from './inspectors/stall-inspector';

export async function probeStreamingStart(
  response: Response,
  stallConfig?: StallConfig | null
): Promise<{ ok: true; response: Response } | { ok: false; error: Error; streamStarted: boolean }> {
  if (!response.body) {
    return { ok: true, response };
  }

  // When TTFB stall detection is configured, probe the stream until we've
  // received ttfbBytes or the TTFB timeout fires. This allows the
  // failover loop to retry with a different provider when a provider is
  // slow to start responding.
  if (stallConfig?.ttfbMs != null) {
    logger.debug(
      `probeStreamingStart: using stall-aware probe (ttfbMs=${stallConfig.ttfbMs}, ttfbBytes=${stallConfig.ttfbBytes})`
    );
    return probeStreamingStartWithStallCheck(response, stallConfig);
  }

  // Original 100ms probe — if the first byte doesn't arrive within 100ms,
  // let the stream continue in the background.
  const reader = response.body.getReader();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timeout: true }), 100);
  });

  try {
    const readPromise = reader.read();
    const readResult = await Promise.race([readPromise, timeoutPromise]);

    if ((readResult as any).timeout) {
      const passthrough = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const first = await readPromise;
            if (!first.done && first.value) {
              controller.enqueue(first.value);
            } else if (first.done) {
              controller.close();
            }
          } catch (error) {
            controller.error(error);
          }
        },
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              controller.close();
            } else {
              controller.enqueue(next.value);
            }
          } catch (error) {
            controller.error(error);
          }
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      });

      return {
        ok: true,
        response: new Response(passthrough, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
      };
    }

    const first = readResult as ReadableStreamReadResult<Uint8Array>;
    const replay = new ReadableStream<Uint8Array>({
      start(controller) {
        if (!first.done && first.value) {
          controller.enqueue(first.value);
        }
      },
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            controller.close();
          } else {
            controller.enqueue(next.value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return {
      ok: true,
      response: new Response(replay, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      streamStarted: false,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Stall-aware stream probe: reads from the stream until we've received
 * `stallConfig.ttfbBytes` bytes or the TTFB timeout fires.
 *
 * - If TTFB threshold is met → returns ok:true, stream continues normally.
 * - If TTFB timeout fires → returns ok:false with a stall error, which the
 *   failover loop treats as retryable (same as a network error before first byte).
 */
async function probeStreamingStartWithStallCheck(
  response: Response,
  stallConfig: StallConfig
): Promise<{ ok: true; response: Response } | { ok: false; error: Error; streamStarted: boolean }> {
  const reader = response.body!.getReader();
  const ttfbBytes = stallConfig.ttfbBytes;
  const ttfbMs = stallConfig.ttfbMs!;

  // Collected chunks to replay into the response stream
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let streamStarted = false;

  // TTFB stall timer
  let ttfbTimerId: ReturnType<typeof setTimeout> | undefined;
  const ttfbTimeoutPromise = new Promise<'ttfb_timeout'>((resolve) => {
    ttfbTimerId = setTimeout(() => resolve('ttfb_timeout'), ttfbMs);
  });

  try {
    // Read chunks until we hit the TTFB byte threshold or the timeout
    while (totalBytes < ttfbBytes) {
      const readPromise = reader.read();
      const result = await Promise.race([readPromise, ttfbTimeoutPromise]);

      if (result === 'ttfb_timeout') {
        // TTFB stall detected — abort the reader
        reader
          .cancel(new DOMException('Stream stalled: TTFB timeout', 'TimeoutError'))
          .catch(() => {});
        logger.info(
          `TTFB stall probe: received ${totalBytes} bytes within ${ttfbMs}ms ` +
            `(threshold: ${ttfbBytes} bytes)`
        );
        return {
          ok: false,
          error: new Error(
            `Stream stalled: TTFB timeout — received ${totalBytes} bytes in ${ttfbMs}ms ` +
              `(threshold: ${ttfbBytes} bytes within ${ttfbMs}ms)`
          ),
          streamStarted,
        };
      }

      const { done, value } = result as ReadableStreamReadResult<Uint8Array>;
      if (done) {
        // Stream ended before we got enough bytes — not a stall, just a short response
        break;
      }

      chunks.push(value);
      totalBytes += value.length;
      streamStarted = true;
    }

    // TTFB threshold met (or stream ended naturally) — build replay stream
    const replayChunks = [...chunks];
    let chunkIndex = 0;
    const replay = new ReadableStream<Uint8Array>({
      start(controller) {
        // Replay buffered chunks
        while (chunkIndex < replayChunks.length) {
          controller.enqueue(replayChunks[chunkIndex]!);
          chunkIndex++;
        }
      },
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            controller.close();
          } else {
            controller.enqueue(next.value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return {
      ok: true,
      response: new Response(replay, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      streamStarted,
    };
  } finally {
    if (ttfbTimerId) clearTimeout(ttfbTimerId);
  }
}
