import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ResponsesTransformer } from '../../responses';
import { OAuthTransformer } from '../oauth-transformer';
import type { Transformer } from '../../../types/transformer';
import type { UnifiedChatRequest } from '../../../types/unified';

// ─── Codex OAuth golden translation gate (docs/NOMOV3.md M2) ────────────────
//
// These fixtures are REAL captured request/response traces from the working
// production Codex (OpenAI Responses) OAuth path. Codex STILL routes through the
// pi-ai `OAuthTransformer` IR conduit (native pass-through is M2), so this gate
// guards the live path.
//
// NOTE: the Anthropic/Claude case was dropped after M1. Anthropic went native
// (AnthropicTransformer + pass-through) and no longer touches `OAuthTransformer`,
// so a Claude IR-translation assertion here tested a path production no longer
// takes. Live Anthropic coverage is `services/__tests__/dispatcher-oauth-native.test.ts`
// plus staging verification. Re-add a Codex-style native gate at M2.
//
// They pin the two translation boundaries the Codex OAuth path owns:
//
//   Request:  client body ──(entry.parseRequest)──▶ UnifiedChatRequest
//                          ──(OAuthTransformer.transformRequest)──▶ pi-ai {context, options}
//   Response: pi-ai events ──(OAuthTransformer.transformStream)──▶ unified chunks
//                          ──(entry.formatStream)──▶ client SSE
//
// The response boundary is the durable contract: the NOMOV3 pass-through must
// reproduce these client SSE bytes regardless of whether pi-ai's Context IR is
// still in the middle. The request boundary asserts the *current* Context-IR
// shape and will be retargeted (not deleted) when M1/M2 replace the IR with a
// native builder — at that point the "want" side stays identical, only the
// producer changes.
//
// Volatile fields are normalized before comparison:
//   - `oauth-<epoch-ms>`     response id           (Date.now())
//   - `"created_at":<epoch>` responses timestamp   (Date.now())
//   - `"rs_…"` / `"fc_…"`    freshly-minted item ids (random)
// Everything else — event ordering, tool-call identity channel, custom_tool_call
// aggregation, usage, stop reasons — is asserted byte-for-byte.

const FIXTURE_DIR = join(__dirname, 'golden-fixtures');

interface GoldenTrace {
  rawRequest: any;
  transformedRequest: { context: any; options: any };
  rawResponse: string; // pi-ai events, NDJSON
  transformedResponse: string; // client SSE
}

function loadTrace(name: string): GoldenTrace {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

/** Normalize the non-deterministic fields the translators mint per request. */
function normalizeVolatile(sse: string): string {
  return sse
    .replace(/oauth-\d+/g, 'oauth-<TS>')
    .replace(/"created_at":\d+/g, '"created_at":<TS>')
    .replace(/"(rs|fc)_[a-z0-9]+"/g, '"$1_<ID>"');
}

/** Strip pi-ai `timestamp` fields (Date.now()) from a Context for comparison. */
function stripTimestamps<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value));
  const walk = (node: any) => {
    if (node && typeof node === 'object') {
      if ('timestamp' in node) delete node.timestamp;
      for (const key of Object.keys(node)) walk(node[key]);
    }
  };
  walk(clone);
  return clone;
}

/** Parse the NDJSON pi-ai event log into a ReadableStream of event objects. */
function eventsToStream(rawResponse: string): ReadableStream<any> {
  const events = rawResponse
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(event);
      controller.close();
    },
  });
}

async function drainToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += typeof value === 'string' ? value : decoder.decode(value);
  }
  return out;
}

/** Reproduce the request-side translation the dispatcher performs. */
async function translateRequest(
  entry: Transformer,
  oauthProvider: string,
  rawRequest: any
): Promise<{ context: any; options: any }> {
  const unified: UnifiedChatRequest = await entry.parseRequest(
    JSON.parse(JSON.stringify(rawRequest))
  );
  unified.model = rawRequest.model;
  unified.metadata = {
    ...(unified.metadata ?? {}),
    plexus_metadata: {
      ...(unified.metadata?.plexus_metadata ?? {}),
      oauthProvider,
    },
  } as UnifiedChatRequest['metadata'];
  return new OAuthTransformer().transformRequest(unified);
}

/** Reproduce the response-side translation the response handler performs. */
async function translateResponse(entry: Transformer, rawResponse: string): Promise<string> {
  const oauth = new OAuthTransformer();
  const unifiedStream = oauth.transformStream(eventsToStream(rawResponse));
  const clientStream = entry.formatStream ? entry.formatStream(unifiedStream) : unifiedStream;
  return drainToString(clientStream);
}

describe('OAuth golden translation (Codex)', () => {
  describe.each([
    ['golden-codex-1.json', 'codex trace 1'],
    ['golden-codex-2.json', 'codex trace 2'],
  ])('Codex (OpenAI Responses) — %s', (fixture) => {
    const trace = loadTrace(fixture);

    test('request → pi-ai Context matches the golden', async () => {
      const out = await translateRequest(
        new ResponsesTransformer(),
        'openai-codex',
        trace.rawRequest
      );
      expect(stripTimestamps(out)).toEqual(stripTimestamps(trace.transformedRequest));
    });

    test('pi-ai events → client Responses SSE matches the golden byte-for-byte', async () => {
      // The Responses transformer is stateful: `custom_tool_call` rendering and
      // raw-string argument aggregation depend on `customToolNames` populated
      // from the request. The SAME instance must parse the request and format
      // the response — exactly as the live pipeline reuses one client
      // transformer. A fresh instance falls back to `function_call` +
      // per-token `function_call_arguments.delta` (the wrong shape).
      const entry = new ResponsesTransformer();
      await entry.parseRequest(JSON.parse(JSON.stringify(trace.rawRequest)));
      const got = await translateResponse(entry, trace.rawResponse);
      expect(normalizeVolatile(got)).toBe(normalizeVolatile(trace.transformedResponse));
    });
  });
});
