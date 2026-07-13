import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
import type { UnifiedChatRequest, UnifiedChatResponse } from '../../types/unified';
import { logger } from '../../utils/logger';
import { CooldownManager } from '../runtime/cooldown-manager';
import type { StallConfig } from '../inspectors/stall-inspector';
import type { RouteResult } from '../routing/router';
import {
  parseCooldownDurationForProvider,
  resolveCooldownProviderType,
} from '../providers/provider-cooldown';

export interface OAuthDispatcherHost {
  buildCancelledError(signal: AbortSignal): Error;
  enrichResponseWithMetadata(
    response: UnifiedChatResponse,
    route: RouteResult,
    targetApiType: string
  ): void;
  extractFailureReason(value: unknown): string | undefined;
  formatFailureReason(error: unknown, includeStatusCode?: boolean): string;
  isQuotaExhaustedError(errorText: string): boolean;
}

export function isOAuthRoute(route: RouteResult, targetApiType: string): boolean {
  if (targetApiType.toLowerCase() === 'oauth') return true;
  if (typeof route.config.api_base_url === 'string') {
    return route.config.api_base_url.startsWith('oauth://');
  }
  const urlMap = route.config.api_base_url as Record<string, string>;
  return Object.values(urlMap).some((value) => value.startsWith('oauth://'));
}

export function isClaudeMaskingApiKeyRoute(route: RouteResult, targetApiType: string): boolean {
  if (isOAuthRoute(route, targetApiType)) {
    return false;
  }

  if (targetApiType.toLowerCase() !== 'messages') {
    return false;
  }

  return route.config.useClaudeMasking === true;
}

export function isPiAiRoute(route: RouteResult, targetApiType: string): boolean {
  return isOAuthRoute(route, targetApiType) || isClaudeMaskingApiKeyRoute(route, targetApiType);
}

export class OAuthDispatcher {
  constructor(private readonly host: OAuthDispatcherHost) {}

  private isAsyncIterable<T>(input: any): input is AsyncIterable<T> {
    return input && typeof input[Symbol.asyncIterator] === 'function';
  }

  private isReadableStream<T>(input: any): input is ReadableStream<T> {
    return !!input && typeof input.getReader === 'function';
  }

  private normalizeOAuthStream(result: any): ReadableStream<any> {
    if (this.isReadableStream(result)) {
      return result;
    }

    if (this.isAsyncIterable(result)) {
      return this.streamFromAsyncIterable(result);
    }

    throw new Error('OAuth provider returned an unsupported stream type');
  }

  private buildOAuthStreamEventError(event: any): Error {
    const message =
      event?.error?.errorMessage ||
      event?.errorMessage ||
      event?.error?.message ||
      event?.message ||
      'OAuth provider error';

    const error = new Error(message) as Error & { piAiResponse?: unknown };
    error.piAiResponse = event;
    return error;
  }

  private buildOAuthRawStreamError(value: unknown): Error | null {
    let text: string | null = null;

    if (typeof value === 'string') {
      text = value;
    } else if (value instanceof Uint8Array) {
      text = new TextDecoder().decode(value);
    } else if (value instanceof ArrayBuffer) {
      text = new TextDecoder().decode(value);
    }

    if (!text) return null;

    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed?.error || typeof parsed.error !== 'object') return null;

      const message =
        parsed.error.message ||
        parsed.error.errorMessage ||
        parsed.message ||
        'OAuth provider error';
      const error = new Error(message) as Error & { piAiResponse?: unknown };
      error.piAiResponse = parsed;
      return error;
    } catch {
      return null;
    }
  }

  async probeOAuthStreamStart(
    stream: ReadableStream<any>,
    stallConfig?: StallConfig | null
  ): Promise<
    { ok: true; stream: ReadableStream<any> } | { ok: false; error: Error; streamStarted: boolean }
  > {
    // Pi-ai streams begin with bookkeeping events (type 'start', 'text_start',
    // 'thinking_start', etc.) that carry no content and precede any error events.
    // If we declare ok:true on the first such event, a 429 error arriving as the
    // SECOND event will be seen after the HTTP response is already committed —
    // too late to retry.  Instead, buffer bookkeeping events and keep reading
    // until we see either:
    //   - An error event  → ok:false → dispatcher retries
    //   - Empty stream    → ok:false → dispatcher retries (quota exhausted)
    //   - A content event → ok:true  → replay all buffered events + rest of stream
    const BOOKKEEPING_TYPES = new Set([
      'start',
      'text_start',
      'text_end',
      'thinking_start',
      'thinking_end',
      'toolcall_start',
      'toolcall_end',
    ]);

    const reader = stream.getReader();
    const buffered: any[] = [];
    const ttfbMs = stallConfig?.ttfbMs;

    try {
      if (ttfbMs != null) {
        // TTFB deadline mode: race each read against remaining time from
        // a single absolute deadline. The deadline never resets after each
        // bookkeeping event — a slow trickle of bookkeeping events cannot
        // avoid timeout. TTFB for OAuth is "time to first non-bookkeeping event".
        const deadline = Date.now() + ttfbMs;
        const stallReason = new DOMException(
          `Stream stalled: TTFB timeout — no response within ${ttfbMs}ms`,
          'TimeoutError'
        );

        while (true) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            try {
              await reader.cancel(stallReason);
            } catch {}
            try {
              reader.releaseLock();
            } catch {}
            return {
              ok: false,
              error: new Error(stallReason.message),
              streamStarted: false,
            };
          }

          let readTimerId: ReturnType<typeof setTimeout> | undefined;
          try {
            const readPromise = reader.read();
            const timeoutPromise = new Promise<never>((_, reject) => {
              readTimerId = setTimeout(() => reject(stallReason), remaining);
              readTimerId.unref?.();
            });

            const { value, done } = await Promise.race([readPromise, timeoutPromise]);

            if (done) {
              try {
                await reader.cancel();
              } catch {}
              try {
                reader.releaseLock();
              } catch {}
              return {
                ok: false,
                error: new Error('OAuth provider returned empty stream (quota exhausted)'),
                streamStarted: false,
              };
            }

            if (value?.type === 'error' || value?.reason === 'error') {
              try {
                await reader.cancel();
              } catch {}
              try {
                reader.releaseLock();
              } catch {}
              return {
                ok: false,
                error: this.buildOAuthStreamEventError(value),
                streamStarted: false,
              };
            }

            const rawError = this.buildOAuthRawStreamError(value);
            if (rawError) {
              try {
                await reader.cancel();
              } catch {}
              try {
                reader.releaseLock();
              } catch {}
              return {
                ok: false,
                error: rawError,
                streamStarted: false,
              };
            }

            buffered.push(value);

            // If this event is not pure bookkeeping, the stream is healthy.
            if (!BOOKKEEPING_TYPES.has(value?.type)) {
              break;
            }
          } catch (err: any) {
            if (err?.name === 'TimeoutError' || err?.message?.includes('stalled')) {
              try {
                await reader.cancel(err);
              } catch {}
              try {
                reader.releaseLock();
              } catch {}
              return {
                ok: false,
                error: err instanceof Error ? err : new Error(String(err)),
                streamStarted: false,
              };
            }
            throw err;
          } finally {
            if (readTimerId !== undefined) {
              clearTimeout(readTimerId);
            }
          }
        }
      } else {
        // No TTFB deadline — use existing indefinite read loop
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            // Stream closed — quota exhausted (no events) or provider gave up.
            reader.releaseLock();
            return {
              ok: false,
              error: new Error('OAuth provider returned empty stream (quota exhausted)'),
              streamStarted: false,
            };
          }

          if (value?.type === 'error' || value?.reason === 'error') {
            reader.releaseLock();
            return {
              ok: false,
              error: this.buildOAuthStreamEventError(value),
              streamStarted: false,
            };
          }

          const rawError = this.buildOAuthRawStreamError(value);
          if (rawError) {
            reader.releaseLock();
            return {
              ok: false,
              error: rawError,
              streamStarted: false,
            };
          }

          buffered.push(value);

          // If this event is not pure bookkeeping, the stream is healthy.
          // Replay all buffered events then continue from the reader.
          if (!BOOKKEEPING_TYPES.has(value?.type)) {
            break;
          }
        }
      }

      // Stream is healthy — replay buffered events then stream the rest.
      // The replay stream takes ownership of the reader; do NOT releaseLock here.
      const snapshot = buffered.slice();
      const replay = new ReadableStream<any>({
        start(controller) {
          for (const ev of snapshot) {
            controller.enqueue(ev);
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

      return { ok: true, stream: replay };
    } catch (error: any) {
      try {
        reader.releaseLock();
      } catch {}
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
        streamStarted: false,
      };
    }
  }

  private describeStreamResult(result: any): Record<string, any> {
    return {
      isPromise: !!result && typeof result.then === 'function',
      isAsyncIterable: this.isAsyncIterable(result),
      isReadableStream: this.isReadableStream(result),
      hasIterator: !!result && typeof result[Symbol.asyncIterator] === 'function',
      hasGetReader: !!result && typeof result.getReader === 'function',
      constructorName: result?.constructor?.name || typeof result,
    };
  }

  private streamFromAsyncIterable<T>(iterable: AsyncIterable<T>): ReadableStream<T> {
    const iterator = iterable[Symbol.asyncIterator]();
    let closed = false;
    let reading = false;

    return new ReadableStream<T>({
      async pull(controller) {
        if (closed || reading) return;
        reading = true;
        try {
          const { value, done } = await iterator.next();
          if (done) {
            closed = true;
            controller.close();
          } else if (!closed) {
            controller.enqueue(value);
          }
        } catch (error) {
          if (!closed) {
            logger.error('OAuth: Stream pull failed', error as Error);
            closed = true;
            controller.error(error);
          }
        } finally {
          reading = false;
        }
      },
      async cancel(reason) {
        closed = true;
        await iterator.return?.(reason);
      },
    });
  }

  /**
   * Wraps an OAuth pi-ai ReadableStream with a transparent monitor that detects
   * error events and triggers a provider cooldown asynchronously.
   *
   * This is needed because pi-ai retries HTTP 429s internally with exponential
   * backoff (delays of 1 s, 2 s, 4 s …), so the final error event may arrive
   * many seconds after the probe has already declared the stream
   * healthy.  Without this wrapper the cooldown is never triggered and the
   * exhausted provider keeps receiving traffic.
   */
  private monitorOAuthStreamForErrors(
    stream: ReadableStream<any>,
    route: RouteResult
  ): ReadableStream<any> {
    const oauthDispatcher = this;
    let readerRef: ReadableStreamDefaultReader<any> | null = null;

    return new ReadableStream<any>({
      async start(controller) {
        readerRef = stream.getReader();
        let eventsEmitted = 0;

        try {
          while (true) {
            const { value, done } = await readerRef.read();
            if (done) {
              // If the stream closed without emitting any events, the upstream
              // provider silently exhausted quota (pi-ai retries 429s internally
              // with exponential backoff and then just closes the stream — no
              // error event is emitted).  Treat this as a provider failure so
              // that a cooldown is triggered and the account is not hammered.
              if (eventsEmitted === 0) {
                logger.warn(
                  `OAuth: Stream closed with 0 events for ${route.provider}/${route.model} — ` +
                    `treating as quota exhaustion and triggering cooldown`
                );

                const syntheticError = new Error(
                  'OAuth provider returned empty stream (quota exhausted)'
                ) as Error & {
                  piAiResponse?: unknown;
                };
                syntheticError.piAiResponse = {
                  stopReason: 'error',
                  errorMessage: 'quota exhausted',
                };

                const wrappedError = oauthDispatcher.wrapOAuthError(
                  syntheticError,
                  route,
                  'oauth'
                ) as any;

                oauthDispatcher.markOAuthProviderFailure(route, wrappedError).catch((e) => {
                  logger.error('OAuth: Failed to mark provider failure from empty stream', e);
                });
              }

              controller.close();
              break;
            }

            // Detect pi-ai error events and trigger cooldown asynchronously.
            // The event shape is: { type: "error", reason: "error"|"aborted", error: AssistantMessage }
            if (value?.type === 'error') {
              const errorMessage =
                value?.error?.errorMessage ||
                value?.errorMessage ||
                value?.error?.message ||
                value?.message ||
                'OAuth provider error';

              logger.warn(
                `OAuth: Stream error event detected for ${route.provider}/${route.model}: ${errorMessage}`
              );

              // Build a synthetic error so wrapOAuthError can determine if this
              // is a quota exhaustion, compute cooldown duration, etc.
              const syntheticError = new Error(errorMessage) as Error & {
                piAiResponse?: unknown;
              };
              syntheticError.piAiResponse = value;

              const wrappedError = oauthDispatcher.wrapOAuthError(
                syntheticError,
                route,
                'oauth'
              ) as any;

              // Trigger cooldown without awaiting so the stream is not blocked.
              oauthDispatcher.markOAuthProviderFailure(route, wrappedError).catch((e) => {
                logger.error('OAuth: Failed to mark provider failure from stream error', e);
              });

              // Do NOT forward the raw provider error event to the client.
              // Close the stream cleanly so the client gets a proper termination
              // rather than raw provider JSON leaking through as completion content.
              // We cannot use controller.error() here because the HTTP response is
              // already committed (message_start was already sent), and erroring an
              // in-flight ReadableStream causes unhandled promise rejections downstream.
              controller.close();
              return;
            }

            eventsEmitted++;
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          readerRef.releaseLock();
          readerRef = null;
        }
      },
      cancel(reason) {
        if (readerRef) {
          readerRef.cancel(reason).catch(() => {});
        }
      },
    });
  }

  async dispatchOAuthRequest(
    context: any,
    request: UnifiedChatRequest,
    route: RouteResult,
    targetApiType: string,
    transformer: any,
    signal?: AbortSignal,
    effectiveStallConfig?: StallConfig | null
  ): Promise<UnifiedChatResponse> {
    if (!transformer.executeRequest) {
      throw new Error('OAuth transformer missing executeRequest()');
    }

    try {
      const oauthProvider = isClaudeMaskingApiKeyRoute(route, targetApiType)
        ? 'anthropic'
        : route.config.oauth_provider || route.provider;
      const oauthAccount = route.config.oauth_account?.trim();
      const authConfig = isClaudeMaskingApiKeyRoute(route, targetApiType)
        ? {
            authMode: 'apiKey' as const,
            apiKey: route.config.api_key?.trim() || '',
          }
        : {
            authMode: 'oauth' as const,
            accountId: oauthAccount || '',
          };

      if (authConfig.authMode === 'oauth' && !authConfig.accountId) {
        throw new Error(
          `OAuth account is not configured for provider '${route.provider}'. ` +
            `Set providers.${route.provider}.oauth_account in plexus config.`
        );
      }

      if (authConfig.authMode === 'apiKey' && !authConfig.apiKey) {
        throw new Error(
          `API key is not configured for Claude masking provider '${route.provider}'. ` +
            `Set providers.${route.provider}.api_key in plexus config.`
        );
      }

      if (authConfig.authMode === 'oauth') {
        this.assertOAuthModelSupported(oauthProvider, route.model);
      }
      const oauthContext = context?.context ? context.context : context;
      const oauthOptions = context?.options;

      logger.debug('OAuth: Dispatching request', {
        routeProvider: route.provider,
        oauthProvider,
        oauthAccount: authConfig.authMode === 'oauth' ? authConfig.accountId : undefined,
        authMode: authConfig.authMode,
        model: route.model,
        targetApiType,
        streaming: !!request.stream,
        hasOptions: !!oauthOptions,
      });

      logger.debug('OAuth: Stall detection config', {
        ttfbMs: effectiveStallConfig?.ttfbMs,
        ttfbBytes: effectiveStallConfig?.ttfbBytes,
        minBytesPerSecond: effectiveStallConfig?.minBytesPerSecond,
        provider: route.provider,
      });

      if (!oauthContext.systemPrompt) {
        oauthContext.systemPrompt =
          this.resolveOAuthInstructions(request, oauthProvider) || oauthContext.systemPrompt;
      }

      // TTFB stall detection for streaming OAuth requests.
      // The stallAbortController is separate from the client signal — aborting
      // it means the provider is too slow to start responding, not that the
      // client disconnected. We intercept stall aborts BEFORE wrapOAuthError
      // can swallow them — the OAuth transformer converts AbortError
      // to generic 'Upstream timeout', losing the stall message).
      const originalSignal = signal;
      let requestSignal = signal;
      let stallAbortController: AbortController | undefined;
      let ttfbTimerId: ReturnType<typeof setTimeout> | undefined;
      let raceTimerId: ReturnType<typeof setTimeout> | undefined;
      const dispatchStartTime = Date.now();

      if (request.stream && effectiveStallConfig?.ttfbMs != null) {
        stallAbortController = new AbortController();
        requestSignal = originalSignal
          ? AbortSignal.any([originalSignal, stallAbortController.signal])
          : stallAbortController.signal;

        const ttfbMs = effectiveStallConfig.ttfbMs!;
        ttfbTimerId = setTimeout(() => {
          stallAbortController!.abort(
            new DOMException(
              `Stream stalled: TTFB timeout — no response within ${ttfbMs}ms`,
              'TimeoutError'
            )
          );
        }, ttfbMs);
        ttfbTimerId.unref?.();
      }

      try {
        // Race executeRequest against the TTFB deadline. The abort signal
        // is passed for cooperative cancellation, but if the upstream
        // doesn't observe it, the Promise.race ensures we don't hang.
        let executePromise: Promise<any>;
        if (request.stream && stallAbortController && effectiveStallConfig?.ttfbMs != null) {
          const deadlineMs = effectiveStallConfig.ttfbMs!;
          executePromise = Promise.race([
            transformer.executeRequest(
              oauthContext,
              oauthProvider,
              route.model,
              !!request.stream,
              oauthOptions,
              authConfig,
              requestSignal
            ),
            new Promise<never>((_, reject) => {
              // Redundant with the timer above, but guarantees we reject
              // even if the upstream ignores the abort signal.
              raceTimerId = setTimeout(
                () => {
                  reject(
                    new DOMException(
                      `Stream stalled: TTFB timeout — no response within ${deadlineMs}ms`,
                      'TimeoutError'
                    )
                  );
                },
                deadlineMs - (Date.now() - dispatchStartTime)
              );
            }),
          ]);
        } else {
          executePromise = transformer.executeRequest(
            oauthContext,
            oauthProvider,
            route.model,
            !!request.stream,
            oauthOptions,
            authConfig,
            requestSignal
          );
        }

        const result = await executePromise;

        // executeRequest succeeded — clear stall timer
        if (ttfbTimerId !== undefined) {
          clearTimeout(ttfbTimerId);
          ttfbTimerId = undefined;
        }
        if (raceTimerId !== undefined) {
          clearTimeout(raceTimerId);
          raceTimerId = undefined;
        }

        // Client disconnect check after executeRequest
        if (originalSignal?.aborted) throw this.host.buildCancelledError(originalSignal);

        if (request.stream) {
          // Compute remaining TTFB for the probe using absolute deadline
          let probeStallConfig: StallConfig | null = effectiveStallConfig ?? null;
          if (effectiveStallConfig?.ttfbMs != null) {
            const deadline = dispatchStartTime + effectiveStallConfig.ttfbMs;
            const remainingMs = deadline - Date.now();
            if (remainingMs <= 0) {
              // Deadline already exceeded after executeRequest — cancel the
              // returned stream before failing, otherwise the upstream
              // connection leaks while failover proceeds.
              try {
                const rawStream = this.normalizeOAuthStream(result);
                if (rawStream && typeof rawStream.cancel === 'function') {
                  await rawStream.cancel();
                }
              } catch {}
              const err = new Error(
                `Stream stalled: TTFB timeout — no response within ${effectiveStallConfig.ttfbMs}ms`
              ) as any;
              err.isStallError = true;
              throw err;
            }
            probeStallConfig = { ...effectiveStallConfig, ttfbMs: remainingMs };
          }

          const rawStream = this.normalizeOAuthStream(result);
          const streamProbe = await this.probeOAuthStreamStart(rawStream, probeStallConfig);

          if (!streamProbe.ok) {
            throw streamProbe.error;
          }

          logger.debug('OAuth: Normalized stream result', this.describeStreamResult(result));

          // Wrap the probed stream with an error monitor so that quota/error events
          // arriving AFTER the 100ms probe timeout still trigger a cooldown.  This
          // is necessary because pi-ai retries HTTP 429s with exponential backoff
          // (1 s, 2 s, 4 s) before emitting the final error event, which takes far
          // longer than the probe's window.
          const monitoredStream = this.monitorOAuthStreamForErrors(streamProbe.stream, route);

          const streamResponse: UnifiedChatResponse = {
            id: 'stream-' + Date.now(),
            model: request.model,
            content: null,
            stream: monitoredStream,
            bypassTransformation: false,
          };

          this.host.enrichResponseWithMetadata(streamResponse, route, 'oauth');
          return streamResponse;
        }

        const unified = await transformer.transformResponse(result);
        this.host.enrichResponseWithMetadata(unified, route, 'oauth');
        return unified;
      } catch (error: any) {
        // ALWAYS clear timer on any error
        if (ttfbTimerId !== undefined) {
          clearTimeout(ttfbTimerId);
          ttfbTimerId = undefined;
        }
        if (raceTimerId !== undefined) {
          clearTimeout(raceTimerId);
          raceTimerId = undefined;
        }

        // Client disconnect takes priority over stall detection
        if (originalSignal?.aborted) throw this.host.buildCancelledError(originalSignal);

        // TTFB stall abort — re-throw with correct stall message BEFORE
        // wrapOAuthError can swallow it
        if (stallAbortController?.signal.aborted) {
          const stallError = new Error(
            `Stream stalled: TTFB timeout — no response within ${effectiveStallConfig?.ttfbMs}ms`
          );
          (stallError as any).isStallError = true;
          throw stallError;
        }

        // Non-stall error — let wrapOAuthError handle it
        throw error;
      }
    } catch (error: any) {
      throw this.wrapOAuthError(error, route, targetApiType);
    }
  }

  private assertOAuthModelSupported(oauthProvider: string, modelId: string) {
    const supportedModels = getBuiltinModels(oauthProvider as any);
    if (!supportedModels || supportedModels.length === 0) {
      throw new Error(`OAuth provider '${oauthProvider}' has no known models.`);
    }

    const isSupported = supportedModels.some((model) => model.id === modelId);
    if (!isSupported) {
      const modelList = supportedModels
        .map((model) => model.id)
        .sort()
        .join(', ');
      throw new Error(
        `OAuth model '${modelId}' is not supported for provider '${oauthProvider}'. ` +
          `Supported models: ${modelList}`
      );
    }
  }

  wrapOAuthError(error: Error, route: RouteResult, targetApiType: string): Error {
    const rawProviderResponse = this.stringifyOAuthProviderResponse((error as any)?.piAiResponse);
    const message = error?.message || 'OAuth provider error';
    const providerResponse =
      this.host.extractFailureReason((error as any)?.piAiResponse) || rawProviderResponse;
    const errorText = providerResponse || message;
    const isQuotaError = this.host.isQuotaExhaustedError(errorText);
    let statusCode = (error as any)?.status || (error as any)?.statusCode;

    if (!statusCode) {
      statusCode = 500;

      if (isQuotaError) {
        statusCode = 429;
      }

      if (
        message.includes('Not authenticated') ||
        message.includes('re-authenticate') ||
        message.includes('expired')
      ) {
        statusCode = 401;
      } else if (message.toLowerCase().includes('model') && message.toLowerCase().includes('not')) {
        statusCode = 400;
      }
    }

    const cooldownTriggered =
      statusCode !== 413 && statusCode !== 422 && !(statusCode === 400 && !isQuotaError);
    const cooldownDuration =
      (statusCode === 429 || isQuotaError) && errorText
        ? parseCooldownDurationForProvider(resolveCooldownProviderType(route), errorText, 'OAuth')
        : undefined;

    const enriched = new Error(message) as any;
    enriched.status = statusCode;
    enriched.statusCode = statusCode;
    enriched.routingContext = {
      provider: route.provider,
      oauthProvider: route.config.oauth_provider || route.provider,
      oauthAccount: route.config.oauth_account,
      targetModel: route.model,
      targetApiType,
      statusCode,
      providerResponse,
      rawProviderResponse,
      cooldownTriggered,
      cooldownDuration,
    };

    return enriched;
  }

  private stringifyOAuthProviderResponse(response: unknown): string | undefined {
    if (response === undefined || response === null) {
      return undefined;
    }

    if (typeof response === 'string') {
      return response;
    }

    try {
      return JSON.stringify(response);
    } catch {
      return String(response);
    }
  }

  async markOAuthProviderFailure(route: RouteResult, oauthError: any): Promise<void> {
    if (!oauthError?.routingContext?.cooldownTriggered) {
      return;
    }

    const failureReason = this.host.formatFailureReason(oauthError, true);

    await CooldownManager.getInstance().markProviderFailure(
      route.provider,
      route.model,
      oauthError?.routingContext?.cooldownDuration,
      failureReason
    );
  }

  private resolveOAuthInstructions(
    request: UnifiedChatRequest,
    oauthProvider: string
  ): string | undefined {
    const requestInstructions = request.originalBody?.instructions;
    if (typeof requestInstructions === 'string' && requestInstructions.trim()) {
      return requestInstructions;
    }

    const systemMessage = request.messages.find((msg) => msg.role === 'system');
    const developerMessage = (request.messages as any[]).find((msg) => msg.role === 'developer');
    const instructionSource = systemMessage || developerMessage;
    const instructionContent = instructionSource?.content;
    if (typeof instructionContent === 'string' && instructionContent.trim()) {
      return instructionContent;
    }

    if (oauthProvider === 'openai-codex') {
      logger.info('OAuth: Inserted default instructions for openai-codex');
      return 'You are a helpful coding assistant.';
    }

    return undefined;
  }
}
