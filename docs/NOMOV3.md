# NOMOV3 — Retire the pi-ai IR from the OAuth path; keep pi-ai for auth + registry only

Status: proposed. Author-driven; solo project ("I", not "we").

Follows on from `NOMOV2.md`, which retired the v2 (`inference-v2`) inference path and
kept `@earendil-works/pi-ai` as a **library** for three things: the model registry, OAuth
token lifecycle, and the OAuth/Claude-masking execution in `dispatchOAuthRequest`. NOMOV2
explicitly deferred one item:

> "Deferred (later, explicitly out of scope here): general v1 cleanup; **folding OAuth2
> token management out of pi-ai.**"

NOMOV3 picks up the deferred thread, but reframes it. The thing worth removing is **not**
the token management — that is the highest-value, lowest-cost part of the dependency. The
thing worth removing is pi-ai's `Context`/`Message`/`Tool` **IR as the request/response
conduit** for OAuth providers, which is the last place NOMOV2's own core finding still
does not hold:

> "pi-ai forces every request through a normalizing `Context`/`Tool`/`Message` model, so
> any wire feature pi-ai doesn't model … is silently dropped unless bypassed with
> extract-before / re-inject-after hacks. A gateway's job is fidelity, so the IR is the
> wrong core."

## Why (one paragraph)

pi-ai is used in the OAuth path in three roles with very different value-to-cost ratios.
**(1) OAuth token management** (`@earendil-works/pi-ai/oauth`: `getOAuthApiKey`,
`getOAuthProvider(s)`, `provider.login()`, `refreshToken`) is ~550 lines of our wrapper
over ~1,600 lines of pi-ai's PKCE/device-code/per-provider-refresh implementation — hard,
thankless, changes-underneath-you code. **Keep it.** **(2) Model registry + compat math**
(`@earendil-works/pi-ai/providers/all`: `builtinModels()`, `getBuiltinModel(s)`,
`clampThinkingLevel`, `getSupportedThinkingLevels`) is a pure data/lookup dependency that
NOMOV2 M2 deliberately built on. **Keep it.** **(3) The `Context` IR as request/response
conduit** (`unifiedToContext`, `piAiMessageToUnified`, `piAiEventToChunk`, and
`piAiModels.stream/complete`) costs ~3,600 lines (`type-mappers.ts` 719,
`oauth-transformer.ts` 673, `oauth-claude.ts` ~746, `masking/**` 1,257, `filters/**` 243)
whose main job is translating into the IR and back out — **and then overriding it.** For
Anthropic OAuth the `onPayload` hook in `oauth-transformer.ts` takes the body pi-ai built
and rewrites it wholesale (`applyClaudeOAuthTransform` → `applyClaudeCodeMasking`: tool
renames, synthetic tool injection, identity spoofing, billing-header signing). So we pay
the full `unified → Context → pi-ai payload` round-trip and then **throw pi-ai's payload
away and re-derive the wire format ourselves.** That is the worst of both worlds, and it
is the exact fidelity tax NOMOV2 removed everywhere except here. Decision: replace the IR
conduit with a per-provider **pass-through** (native wire format in/out, pi-ai used only
to resolve the token and the registry metadata), the same architecture NOMOV2 validated
for v1's dispatcher.

This doc covers three milestones plus one decision item:
1. **M1 — Anthropic OAuth pass-through** (highest value; we already build its wire payload).
2. **M2 — Codex OAuth pass-through** (second; `openai-responses`/`openai-codex-responses`).
3. **M3 — Drop Gemini + Antigravity OAuth** (decided; M3a provider-surface removal can land now).
4. Collapse the now-unused IR translation surface once no OAuth provider routes through it.

---

## What stays vs. what goes

**Stays (pi-ai as a library — no change):**
- `@earendil-works/pi-ai/oauth` — token lifecycle. `OAuthAuthManager`
  (`services/oauth/oauth-auth-manager.ts`, 253) + `OAuthLoginSessionManager`
  (`services/oauth/oauth-login-session.ts`, 294) keep wrapping it verbatim.
- `@earendil-works/pi-ai/providers/all` + top-level types — registry + compat math.
  `services/pi-ai/registry.ts` (`builtinModels`, `getBuiltinModel`, `buildThinkingOptions`,
  `buildReasoningOptionsForModel`, …) is unchanged; it becomes the source of the
  per-provider egress options that the new pass-through emitters consume directly.
- The quota checkers (`services/quota/checkers/*-checker.ts`) — they import only the
  `OAuthProvider` **type** and call `authManager.getApiKey(...)`. No IR coupling; untouched.
- The compaction service (`services/compaction/**`) — imports `Context` and message
  **types** only. Independent of the OAuth conduit; untouched here (its own IR question is
  out of scope).

**Goes (the IR-as-conduit surface, per provider, as each milestone lands):**
- `transformers/oauth/type-mappers.ts` — `unifiedToContext`, `piAiMessageToUnified`,
  `piAiEventToChunk`, `jsonSchemaToTypeBox`, usage/stop-reason mappers.
- `transformers/oauth/oauth-transformer.ts` — `transformRequest`/`transformResponse`/
  `transformStream` and the `piAiModels.stream/complete` + `onPayload` execution dance.
- The pi-ai-stream-event assumptions baked into `oauth-dispatcher.ts`
  (`probeOAuthStreamStart`'s `BOOKKEEPING_TYPES`, `buildOAuthStreamEventError`) — these
  read pi-ai event objects (`type: 'start'|'text_start'|…`, `event.error.errorMessage`)
  and must move to SSE-frame parsing.

---

## Current mechanics (ground truth — read before editing)

The OAuth path today, per request:

1. Router picks an OAuth route; `dispatcher.isPiAiRoute()` → `dispatchOAuthRequest()`
   (`services/oauth/oauth-dispatcher.ts:505`).
2. Upstream of dispatch, `OAuthTransformer.transformRequest()`
   (`transformers/oauth/oauth-transformer.ts`) has already converted the
   `UnifiedChatRequest` into `{ context, options }` via `unifiedToContext()` — this is the
   IR conversion we are removing.
3. `dispatchOAuthRequest()` resolves provider/account/auth, then calls
   `transformer.executeRequest(context, provider, model, streaming, options, auth, signal)`
   (`:615`/`:641`).
4. `executeRequest()` resolves the API key
   (`OAuthAuthManager.getApiKey` → pi-ai `getOAuthApiKey`, with auto-refresh + DB
   write-back), looks up the pi-ai `Model`, then calls `piAiModels.stream/complete`.
   For Anthropic Claude-Code tokens, `requestOptions.onPayload` **replaces** pi-ai's body
   with `applyClaudeOAuthTransform()` + `applyClaudeCodeMasking()` output.
5. Response: non-streaming → `transformResponse()` → `piAiMessageToUnified()`; streaming →
   `transformStream()` → `piAiEventToChunk()` per pi-ai event. Tool-name rename reversal is
   layered on top (`wrapStreamWithToolRenameReversal`, `reverseToolRenamesInValue`).
6. Stall/retry: `probeOAuthStreamStart()` buffers pi-ai **bookkeeping events** to detect a
   late error (e.g. 429 as the second event) before committing the HTTP response.

The pass-through target: steps 2–5 collapse to "build the provider-native body → POST with
the resolved token + headers → stream/return raw bytes, parsing SSE only for usage and
tool-name reversal." Step 6 keeps its retry semantics but probes SSE frames instead of
pi-ai events.

---

## Golden translation gate (landed ahead of M1/M2)

Status: **landed; Claude case dropped after M1.**
`transformers/oauth/__tests__/oauth-golden-translation.test.ts` +
`golden-fixtures/{golden-codex-1,golden-codex-2}.json`.

**Post-M1 update:** the Claude/Anthropic case (and `golden-claude.json`) was **removed**.
It asserted the pi-ai `OAuthTransformer` IR translation, but M1 made Anthropic native —
Anthropic no longer touches `OAuthTransformer`, so the assertion tested a path production
no longer takes (a stale gate / false confidence — the exact "tests aren't representative"
trap from the M1-hardening lessons). Live Anthropic coverage is now
`services/__tests__/dispatcher-oauth-native.test.ts` + staging verification. The **two
Codex cases stay** — Codex still routes through the IR conduit until M2, so they guard the
live path. Re-add a native-style Codex gate when M2 ports Codex.

Three **real captured traces** from the working OAuth path (one Claude Code / Anthropic
Messages, two Codex / OpenAI Responses) are pinned as byte-for-byte assertions on both
translation boundaries:

- **Request:** client body → `entry.parseRequest` → `OAuthTransformer.transformRequest`
  → pi-ai `{context, options}`. Asserted `toEqual` the captured `transformedRequest`
  (pi-ai `timestamp` fields stripped). Claude also applies `applyClaudeCodeToolProxy` in
  place to mirror `executeRequest`.
- **Response:** pi-ai events (NDJSON) → `OAuthTransformer.transformStream` →
  `entry.formatStream` → client SSE. Asserted byte-identical to the captured
  `transformedResponse`, normalizing only volatile mints: `oauth-<epoch-ms>`,
  `"created_at":<epoch>`, and random `rs_`/`fc_` item ids.

All six assertions pass against **current** code. This is the M1/M2 safety net and the
answer to **Q2**: it captures today's exact client-facing bytes so the pass-through rewrite
can be proven equivalent, and it will be **retargeted, not rewritten** — when M1/M2 replace
the Context IR with native builders, the "want" side (captured client SSE) stays identical;
only the producer under test changes.

### Two findings this gate nails down (both load-bearing for M2)

1. **Codex renders `custom_tool_call`, not `function_call`.** The golden Codex response
   aggregates the tool arguments into a single `response.output_item.done` with a **raw
   string** `input` and emits **zero** `response.function_call_arguments.delta` events. This
   is the OpenAI freeform/`custom` tool wire shape — exactly the fidelity feature NOMOV2
   flagged the IR can't model. The M2 native Codex builder/parser MUST reproduce it.
2. **The Responses transformer is stateful and the instance must be shared.**
   `custom_tool_call` rendering depends on `customToolNames`, populated from the request in
   `parseRequest`/`transformRequest`. The **same** `ResponsesTransformer` instance has to
   parse the request and format the response; a fresh instance silently falls back to
   `function_call` + per-token argument deltas (the wrong shape). A mutation test (dropping
   the request seed) confirms the assertion catches exactly this regression. M2 must carry
   the custom-tool set from request to response explicitly — it cannot rely on IR events
   alone.

---

## Milestone 1 — Anthropic OAuth pass-through

Status: **LANDED.** Anthropic OAuth no longer uses the pi-ai executor. It builds the
native Anthropic body via `AnthropicTransformer`, masks it with the existing
`masking/**` pipeline, resolves the OAuth token via `OAuthAuthManager`, and runs through
the **standard dispatch path** (`executeStandardAttempt` → real fetch → raw-byte
pass-through). Response tool-name renames are reversed on the raw SSE frames; no pi-ai
`Context` IR, no `piAiModels.stream`, no event translation.

### What landed
- `services/oauth/oauth-native-request.ts` — the reusable core: native body + token →
  `{ url, headers, body, reverseResponseFrame }`. Reuses `applyClaudeOAuthTransform` +
  `applyClaudeCodeMasking` (masking is input-agnostic — it rebuilds the CC system/identity
  itself, so it masks the native body identically to pi-ai's `buildParams()` output),
  `REQUIRED_BETAS`/`getStainlessHeaders`, and `reverseToolRenames` +
  `reverseRemapOAuthToolNamesFromStreamLine` for the response. Upstream baseUrl from the
  pi-ai registry (fallback `api.anthropic.com`).
- `services/dispatch/request-payload-builder.ts` — `isNativeOAuthRoute()` gate +
  `buildNativeOAuthPayload()`: builds/masks the body and stashes the prepared request on
  the route (`NATIVE_OAUTH_STASH`). Returns `bypassTransformation: true`.
- `services/dispatch/dispatcher.ts` — `buildRequestUrl`/`setupHeaders` read the stash;
  `handleStreamingResponse` + `handleNonStreamingResponse` apply the reverse-frame on raw
  bytes via `buildSseFrameRewriteTransform`.
- `services/dispatch/request-manager.ts` — native OAuth uses the provider-native
  transformer and `executeStandardAttempt`; the pi-ai `executeOAuthAttempt` fork is gated
  to `usePiAiExecutor` (non-native providers only).
- Tests: `dispatcher-oauth-native-streaming.test.ts` proves raw upstream Anthropic SSE
  reaches the client byte-preserved (`ping`, `stop_details`, `inference_geo`,
  cache-creation breakdown, exact whitespace — all the fidelity the pi-ai round-trip
  dropped) with rename reversal; `dispatcher-oauth-passthrough.test.ts` /
  `dispatcher-sticky-session.test.ts` updated to assert the native endpoint + CC headers.
  Full suite 2198 green.

### Gained for free by using the standard path
Failover, cooldown, concurrency-slot release, raw-byte TTFB stall probe, and HTTP-error
handling all come from `executeStandardAttempt` — no OAuth-specific reimplementation.

### Still on the pi-ai executor (per-provider rollout)
Codex/Copilot remain on `executeOAuthAttempt` until M2 ports them the same way
(`isNativeOAuthProvider` returns true only for `anthropic`). Per-provider rollback intact.

---

## M1 hardening — single-path design + live staging verification (LANDED)

The first M1 cut shipped with mocked-fetch tests only. Driving a **real** Claude request
through staging (`direct/cc-sigma/claude-sonnet-5` via the management API) surfaced a
class of bugs the unit tests could not see, and forced the design to what it should have
been from the start. This section is the load-bearing record of what we learned.

### The bug class (what live traffic exposed)
Staging returned `400 model: Field required`, then (after a naive patch) `400 messages:
Field required` — Anthropic rejecting the outbound body field-by-field. Root cause was
**not** any single field. The native path had built a *second, divergent* body-construction
path (`buildNativeOAuthPayload`) that always called `transformer.transformRequest(request)`
— and it was handed the **wrong transformer**, producing pi-ai **Context IR**
(`{context, options, system, metadata}`) with no top-level `model`/`messages` at all.

### The meaning of the `oauth` API type (the crux)
`getProviderTypes()` maps an `oauth://<provider>` base URL to the **synthetic** API type
`'oauth'` (`config.ts`). That string is a *routing/auth marker*, **not** a wire protocol.
It exists to say "resolve a token for this provider," nothing more. Two things read it and
must never conflate it with the real upstream API:
- **Transformer selection.** `TransformerFactory.getTransformer('oauth')` returns the pi-ai
  `OAuthTransformer`, whose `transformRequest` emits Context IR. For a *native* OAuth
  provider that is exactly the IR conduit M1 is removing — selecting it re-introduces the
  bug.
- **Pass-through matching.** `shouldUsePassThrough` compares `incomingApiType ===
  targetApiType`. A Claude Code client sends `messages`; if the target type is `'oauth'`
  the comparison fails and pass-through is (wrongly) disabled.

**The fix:** a native OAuth provider's *effective wire API type* is its real upstream
protocol — for Anthropic that is `messages`. `nativeOAuthApiType(provider)`
(`oauth-native-request.ts`) owns this mapping (`anthropic → 'messages'`).
`request-manager.ts` computes `effectiveApiType` for native routes and uses it for
transformer selection **and** downstream (`transformRequestPayload`,
`executeStandardAttempt`). Codex/Copilot keep `'oauth'` because they still use the pi-ai
executor. Net rule: **`oauth` means "needs a token," never "speaks a protocol called
oauth."**

### Single-path design (the real architecture)
There is **one** request path. `buildRequestPayload` builds the provider body the same way
for everyone — pass-through of the client's native body when `incomingApiType ===
targetApiType`, or a cross-format transform otherwise — applies the common pipeline
(auto-compat, `extraBody`, model behaviors, adapters), and **only then**, if the selected
target is an OAuth target, layers the one OAuth-specific step on top: CC masking + token
resolution + tool-rename reversal (`prepareNativeOAuthDispatch`, stashed in
`NATIVE_OAUTH_STASH`). The separate `buildNativeOAuthPayload` function is **deleted**.
`shouldUsePassThrough` now allows pass-through for native OAuth (only the pi-ai-executor
routes are excluded). Masking is input-agnostic (it rebuilds the CC system/identity
wholesale), so it masks a pass-through body identically to a transformed one. This is the
architecture the doc's thesis always implied: *pass-through in/out; OAuth is a token +
masking concern layered on the standard path, not a parallel path.*

Why this matters beyond the bug: the pass-through body is the client's **actual** Messages
body, so every field the client sent (system, tools, metadata, cache_control, unknown
future fields) reaches the masking step verbatim — the same fidelity win as the response
side. Rebuilding via the transformer would silently drop anything the UnifiedChatRequest
doesn't model.

### Tests aren't always representative (why unit tests missed this)
The native OAuth unit tests passed while staging failed because their fixture config
hard-coded `access_via: ['messages']` on the model target. That made `selectTargetApiType`
return `'messages'` and (accidentally) pick the right transformer + enable pass-through —
masking the whole bug. **Real deployments leave `access_via` empty**, so the type is
inferred from the `oauth://` URL as `'oauth'`, exercising the broken branch. Lesson: a
fixture that hard-codes a value the real system *derives* can validate a path production
never takes. The native tests now use **empty `access_via`** to mirror deployments, and
assert the outbound body is a real Anthropic Messages body (`model` = resolved target,
`messages`, `max_tokens`) and **not** IR (`context`/`options`). Mocked-fetch tests are
necessary but not sufficient — a live request through the running instance is the gate
that turns "should work" into "works."

### Live staging verification (the gate that actually caught it)
All three exercised via the management API against real Anthropic through `cc-sigma`
(the `cc` account was quota-exhausted — a real 5-hour limit, not a code fault):
- **Non-streaming** → `200`, correct text, full fidelity (`stop_details`, `cache_creation`,
  `inference_geo`, `speed`, `output_tokens_details`, `context_management`).
- **Streaming** → `200`, raw Anthropic SSE (`event: ping`, full block sequence, exact
  upstream whitespace preserved → true raw-byte pass-through).
- **Tool call** → `200`, caller tool name (`get_weather`) round-trips intact, no `mcp__`
  leak.
- Debug trace confirmed the outbound body keys were `{max_tokens, messages, metadata,
  model, system}` with `model=claude-sonnet-5` and **no** `context` IR key.

### Files (single-path refactor)
- `services/oauth/oauth-native-request.ts` — added `nativeOAuthApiType(provider)`.
- `services/dispatch/request-manager.ts` — `effectiveApiType` for native routes; used for
  transformer selection + `transformRequestPayload` + `executeStandardAttempt`.
- `services/dispatch/request-payload-builder.ts` — deleted `buildNativeOAuthPayload`; folded
  masking into the single path; `shouldUsePassThrough` allows native OAuth.
- `services/__tests__/dispatcher-oauth-native.test.ts` — empty-`access_via` config +
  outbound-body-shape regression assertions.

---

### Original plan (retained for reference)

**Highest value, do first.** We already generate Anthropic's final wire
payload ourselves in `transformers/oauth/masking/**`, so we are closest to just POSTing it.

### Goal
For `provider === 'anthropic'` OAuth routes (and the `useClaudeMasking` API-key route),
stop routing through `unifiedToContext` / `piAiModels.stream` / `onPayload`. Instead:
build the Anthropic `/v1/messages` body directly, apply the existing `masking/` pipeline,
POST with the pi-ai-resolved OAuth token + Claude-Code headers, and pass the response
through with SSE parsing only for usage + tool-rename reversal.

### Why Anthropic first
- The masking pipeline (`applyClaudeCodeMasking`) **already emits a complete Anthropic
  wire body** — identity/system shape, synthetic tools, renames, `metadata.user_id`,
  CCH billing signature. Today it runs *after* pi-ai builds a body we discard. Moving it to
  build *the* body removes a full IR round-trip with near-zero new masking code.
- Headers are already assembled by hand in `executeRequest` (`REQUIRED_BETAS`,
  `getStainlessHeaders()`, `anthropic-version`, `x-api-key` shim for masked API-key mode).
- Anthropic Messages SSE is well-understood and already round-tripped by v1's non-OAuth
  Messages path — reuse that parser rather than pi-ai's.

### Changes
1. **Request builder** — new `transformers/oauth/anthropic/build-request.ts`: take the
   `UnifiedChatRequest` (+ resolved reasoning/generation options from
   `services/pi-ai/registry.ts` `buildGenerationOptions`) and emit the raw Anthropic
   `/v1/messages` JSON body directly (messages, system, tools, tool_choice, thinking,
   max_tokens, temperature). This replaces the `unified → Context` half of
   `unifiedToContext` for Anthropic only. Feed the body through the **unchanged** `masking/`
   pipeline (`applyClaudeCodeMasking`) — its input is already an Anthropic body shape.
2. **Transport** — POST the masked body to the Anthropic base URL with the token from
   `OAuthAuthManager.getApiKey('anthropic', accountId)` and the hand-built header set.
   Reuse v1's dispatcher HTTP + streaming primitives (the pass-through path NOMOV2 kept)
   rather than `piAiModels.stream/complete`. Keep the GitHub-Business-style provider quirks
   that live in `executeRequest` only if Anthropic needs them (it does not — that block is
   Copilot-specific; leave it in the Copilot path).
3. **Response** — parse Anthropic SSE natively into `UnifiedChatStreamChunk` (the same
   target shape `piAiEventToChunk` produced), applying `reverseToolRenames()` +
   `restoreOriginalOAuthToolName()` on tool-call names. Non-streaming: parse the single
   Messages response body the same way. This replaces the Anthropic branches of
   `piAiMessageToUnified` / `piAiEventToChunk`.
4. **Dispatcher stall/retry** — add an SSE-frame probe alongside `probeOAuthStreamStart`
   for the pass-through path: buffer Anthropic SSE `event:`/`data:` frames, treat an
   `error` event or empty stream as retryable (same semantics as the pi-ai event probe),
   replay buffered frames on first content. Keep the existing pi-ai-event probe until M3
   removes the last IR provider.
5. **Usage extraction** — Anthropic SSE `message_start`/`message_delta` carry usage; parse
   it directly (replaces `OAuthTransformer.extractUsage`'s `event.type === 'done'` shape).

### Tool-rename correctness (load-bearing)
The streamed tool-call identity routing and rename reversal are the historically fragile
part (`type-mappers.ts` `toolCallIdentityChannel`, the `#719` Codex fix, the Anthropic
"open block only on truthy id" behavior). For Anthropic specifically the channel is
`'start'`. Preserve that: emit identity once on the first `content_block_start` for a
`tool_use` block, args-only on `input_json_delta`. Port the existing regression tests.

### Tests
- **The golden gate is already landed** (`oauth-golden-translation.test.ts`,
  `golden-claude.json`) and asserts the Claude response byte-for-byte and the request
  Context shape. Retarget the response assertion at the new native Anthropic path; the
  captured client SSE stays the "want" side unchanged.
- Keep/adapt `transformers/oauth/__tests__/oauth-claude.test.ts`,
  `transformers/oauth/masking/__tests__/**` (masking input is unchanged — high-value
  guardrail that the port didn't alter the wire body).
- New: request-builder golden test (unified in → masked Anthropic body out) that asserts
  byte-identical output to today's `onPayload` result — capture today's
  `FULL-OUTGOING-PAYLOAD` debug logs as the golden body fixtures (Q2).
- New: SSE parse tests for streaming usage + tool-rename reversal (port the intent of
  `oauth-anthropic-stream-regression.test.ts`).
- Run: `bun run test`, `bun run typecheck`, `bun run format:check`.

### Risk / rollback
- The masking pipeline is the crown jewels; the golden test (byte-identical body) is the
  gate. If it can't be made to match, stop — do not ship a different fingerprint.
- Rollback is per-provider: the pi-ai IR path stays wired for Codex/Gemini during M1, so a
  regression reverts Anthropic to `executeRequest`/`piAiModels.stream` without touching the
  others.

---

## Milestone 2 — Codex OAuth pass-through

Status: proposed. Second priority. Depends on M1's dispatcher SSE-probe primitive.

### Goal
For `provider === 'openai-codex'`, replace the IR conduit with a native OpenAI Responses
(`openai-codex-responses`) pass-through: build the Responses body, POST with the
Codex OAuth token + the version/User-Agent headers `CodexVersionService` already supplies,
stream raw with SSE parsing for usage + tool-call identity.

### Why second
- No masking pipeline — Codex doesn't get the Anthropic fingerprint surgery — so the
  request side is simpler than Anthropic (no `applyClaudeCodeMasking`). But the
  **streaming tool-call semantics are the ones the `#719` fix targeted** (emit tool name
  once; Codex rejects re-accumulated over-length names), so the SSE parser must reproduce
  the `'start'`-channel identity behavior exactly.
- Codex needs the `Version` header + `User-Agent` from `CodexVersionService` (already in
  `executeRequest`) and reasoning-effort/verbosity egress from
  `buildGenerationOptions` — both already exist and are reused verbatim.

### Changes
1. Request builder `transformers/oauth/codex/build-request.ts`: unified → raw
   `openai-responses` body (input items, tools, reasoning effort, text verbosity,
   service tier, max output tokens), using `services/pi-ai/registry.ts` for the
   effort/verbosity mapping. Replaces the Codex half of `unifiedToContext`.
2. Transport: POST with Codex token + `Version`/`User-Agent` headers, v1 HTTP primitives.
3. Response: native OpenAI Responses SSE parse → `UnifiedChatStreamChunk`, `'start'`-channel
   tool-call identity, **`custom_tool_call` aggregation with raw-string `input` (no
   `function_call_arguments.delta`)**, usage from the Responses `response.completed`/usage
   frames. Replaces the Codex branches of `piAiEventToChunk`/`piAiMessageToUnified`. The
   custom-tool set must be threaded from the request explicitly (see the golden gate
   finding #2 — the current stateful `ResponsesTransformer` instance sharing is the
   behavior to preserve, not inherit accidentally).
4. Dispatcher: reuse M1's SSE probe.

### Tests
- **The golden gate is already landed** (`oauth-golden-translation.test.ts`,
  `golden-codex-{1,2}.json`) and is the primary equivalence check: retarget the response
  assertion at the new native Codex parser and keep the captured client SSE as the "want"
  side unchanged. Byte-identical `custom_tool_call` output is the gate.
- Port `oauth-type-mappers` Codex cases + the `#719` regression intent to SSE-parse tests.
- `bun run test`, `bun run typecheck`, `bun run format:check`.

### Risk
- The `#719` failure mode (over-length accumulated tool name) is the thing to guard;
  identity-once must be covered before/after.

---

## Milestone 3 — Drop Gemini CLI + Antigravity OAuth

Status: **M3a landed; M3b deferred to M4.** Decided — DROP (option A).

### M3a landed (this change)
- `oauth-dispatcher.ts`: `DROPPED_OAUTH_PROVIDERS` set + rejection in
  `assertOAuthModelSupported` ("no longer supported").
- `checker-registry.ts`: removed `gemini-cli-checker` / `antigravity-checker` registration;
  deleted both checker files.
- `model-metadata-manager.ts`: dropped the `google-gemini-cli` / `google-antigravity`
  catalog-normalization cases.
- `config.ts`: enum values retained-but-inert (annotated) so old configs still load.
- Frontend `useProviderForm.tsx`: removed both from the new-provider OAuth picker (quota
  config components + checker-type map left in place for dormant configs).
- Docs: `README.md`, `docs/CONFIGURATION.md`, OpenAPI `ProviderConfig.yaml` updated.
- Tests: `services/oauth/__tests__/dropped-oauth-providers.test.ts` (routing rejection +
  non-destructive config load). Gemini IR regression test still green (M3b untouched).

### Context
Gemini CLI and Antigravity are Google-Cloud-OAuth pass-throughs (`google-gemini-cli`).
Real-world signal: usage is near-zero, and Google has been **banning accounts** that drive
these subscription endpoints through third-party gateways. The maintenance cost is not just
the port — Gemini is the **only** provider that needs the `'delta'` tool-call identity
channel (`toolCallIdentityChannel(provider) === 'delta'`), the whole load-bearing comment
block in `type-mappers.ts` exists for it, and its SSE/stream shape differs from
Anthropic/Codex. It is the single most expensive provider to carry through a pass-through
rewrite, for the least usage, against an actively hostile upstream. Decision: **drop.**
This also converts M4 from "trim `type-mappers.ts`" into "delete `type-mappers.ts`" (no
remaining IR provider), the larger structural win.

### Sequencing note
The **routing / quota / config / docs** removal below is independent of M1–M2 and can land
**now**, ahead of the Anthropic/Codex pass-through work. The one entangled piece — the
`'delta'` tool-call identity channel and Gemini branches inside `type-mappers.ts` /
`piAiEventToChunk` — stays live (as dead-but-referenced code) until **M4** deletes the IR
surface, because Anthropic/Codex still route through `type-mappers.ts` until they are
ported. So M3 splits: **M3a (now)** removes the provider surface; **M3b (in M4)** deletes
the Gemini IR branches.

### M3a — provider surface removal (now)
- **Config validation must not hard-break existing deployments.** `OAuthProviderSchema`
  (`config.ts:213`) is a Zod enum used to validate persisted config; simply deleting
  `'google-gemini-cli'` / `'google-antigravity'` fails-load any config that still
  references them — that is a destructive break, **not** the dormant/ignored behavior
  NOMOV2 established for `keys.beta`. Approach: **keep the two enum values accepted at
  parse time** (so old configs still load) but **reject them at routing** with a clear
  "OAuth provider `google-gemini-cli` is no longer supported" error via
  `assertOAuthModelSupported`. Equivalent for the quota-checker discriminated union: keep
  the `gemini-cli` / `antigravity` literals parseable but no-op the checkers (or drop the
  checker registration so a configured checker simply never runs). Net: old config loads,
  the feature is inert, no migration.
- **Remove checker registration**: `services/quota/checker-registry.ts:204-205`
  (`import('./checkers/gemini-cli-checker')`, `import('./checkers/antigravity-checker')`).
- **Delete** `services/quota/checkers/gemini-cli-checker.ts`,
  `services/quota/checkers/antigravity-checker.ts` + their `__tests__` if any.
- **`model-metadata-manager.ts:955-956`** — drop the `google-antigravity` /
  `google-gemini-cli` cases (fall through to default).
- **Admin UI** — remove Gemini/Antigravity from the OAuth-provider options + any
  provider-specific quota-checker config forms.
- **Docs** — remove Gemini/Antigravity from `README.md` OAuth list + `docs/CONFIGURATION.md`.
- **Leave persisted Gemini/Antigravity provider + checker config dormant/ignored** — no
  destructive migration (NOMOV2 `keys.beta` precedent).

### M3b — IR branch deletion (folded into M4, not yet done)
- Remove the `'delta'` identity channel (`toolCallIdentityChannel`) and the Gemini branches
  of `piAiEventToChunk` / `piAiMessageToUnified` when M4 deletes `type-mappers.ts`.
- Remove Gemini stream regression suites at the same time.

### Tests
- Assert Gemini/Antigravity routes are rejected at dispatch with the "no longer supported"
  error (M3a).
- Assert a persisted config containing a Gemini provider / `gemini-cli` checker still
  **loads** without a validation error (guards the non-destructive requirement).
- Remove Gemini/Antigravity OAuth execution suites with M3b (M4).

---

## Milestone 4 — Collapse the IR translation surface

Status: proposed. Runs after M1–M3 (gated on M3's keep/drop decision).

### Goal
Once no OAuth provider routes through the pi-ai `Context` IR, delete the conduit code.

### Changes
- **If M3 = drop (A):** delete `transformers/oauth/type-mappers.ts` entirely; delete
  `OAuthTransformer.transformRequest/transformResponse/transformStream/executeRequest` +
  the `onPayload`/`piAiModels.stream|complete` machinery from `oauth-transformer.ts`,
  leaving only whatever thin glue the new per-provider builders need (or delete the file if
  the builders own their own transport).
- **If M3 = keep (B):** trim `type-mappers.ts` to the Gemini branches only; keep the
  Gemini executor path; delete the Anthropic/Codex branches.
- Remove the pi-ai-event assumptions from `oauth-dispatcher.ts`
  (`probeOAuthStreamStart` `BOOKKEEPING_TYPES`, `buildOAuthStreamEventError`) once the SSE
  probe fully replaces them — again gated on whether any IR provider remains.
- `filters/pi-ai-request-filters.ts` / `pi-ai-request-filter-rules.ts`: re-target the
  parameter-strip rules to run against the native request builders (the rules are
  provider+model keyed and still valid; only their input shape changes from pi-ai options
  to native body fields). Keep the Claude-Code tool-proxy logic — it operates on the
  Anthropic body and moves into M1's builder.

### Definition of done for M4
- No OAuth request constructs a pi-ai `Context` or calls `piAiModels.stream/complete`
  (verify by grep: no `unifiedToContext`, no `piAiModels.stream|complete` in the OAuth
  path).
- pi-ai imports in the OAuth path are limited to `/oauth` (token) and `/providers/all`
  (registry/compat) — verify by import audit.

---

## Decisions made
- **Keep pi-ai for auth + registry; remove it as the request/response IR.** The dependency
  shrinks to "token lifecycle + model registry/compat," not zero.
- **Order: Anthropic → Codex → Gemini/Antigravity.** Anthropic first because we already
  emit its wire body; Codex second; Gemini/Antigravity last and probably dropped.
- **Gemini/Antigravity: DROP (option A) — decided.** Near-zero usage, active upstream bans,
  and the sole driver of the most complex IR branch (`'delta'` identity channel). Removal
  splits into M3a (provider surface — routing/quota/config/docs, land now) and M3b (delete
  the Gemini IR branches, folded into M4). Enum/checker literals stay parseable to avoid
  fail-loading old configs; the feature is made inert at routing instead.
- **Byte-identical masking gate.** M1 ships only if the new Anthropic request builder emits
  a body byte-identical to today's `onPayload` output for the fixture set. The fingerprint
  is not allowed to drift as a side effect of the refactor.
- **No destructive migrations.** Any provider config that stops being used (e.g. dropped
  Gemini providers) goes dormant/ignored, matching NOMOV2's `keys.beta` precedent.
- **Per-provider rollback.** Each milestone leaves the other providers on their existing
  path, so a regression reverts one provider without touching the rest.

## Open questions
- **Q1 (M3): RESOLVED — drop Gemini/Antigravity (option A).** M3a (provider surface) lands
  now; M3b (IR branch deletion) folds into M4.
- **Q2 (M1): RESOLVED.** Response side locked by the golden gate; request/outgoing-body
  side confirmed **live on staging** — real Anthropic accepted the native masked body
  (non-streaming, streaming, and tool-call round-trip all `200`), and the debug trace
  showed a proper Messages body (no Context IR). The single-path refactor (see "M1
  hardening") is the equivalence proof that matters: the masking now runs on the same
  body the standard path produces.
- **Q3:** Does the compaction service's use of the pi-ai `Context` type create any coupling
  once the OAuth path stops producing `Context` objects? (Expected: no — compaction takes
  `Context` from the non-OAuth path and only imports the type. Confirm.)

## Definition of done
- OAuth requests for Anthropic (M1) and Codex (M2) build native wire bodies and stream via
  v1 pass-through primitives; no `Context` IR, no `piAiModels.stream/complete`, no
  `onPayload` payload-replacement dance on those paths.
- Gemini/Antigravity resolved per M3 (dropped or frozen), with a recorded decision.
- The pi-ai dependency in the OAuth path is limited to `@earendil-works/pi-ai/oauth`
  (token lifecycle) and `@earendil-works/pi-ai/providers/all` (registry/compat); verified
  by import audit.
- Claude-Code fingerprint parity proven byte-identical on the M1 fixture set; all OAuth +
  masking tests green.
- `bun run test`, `bun run typecheck`, `bun run format:check` pass; OAuth login + a live
  request verified for each surviving provider.
