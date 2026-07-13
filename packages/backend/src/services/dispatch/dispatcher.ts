import {
  UnifiedChatRequest,
  UnifiedChatResponse,
  UnifiedTranscriptionRequest,
  UnifiedTranscriptionResponse,
  UnifiedSpeechRequest,
  UnifiedSpeechResponse,
  UnifiedImageGenerationRequest,
  UnifiedImageGenerationResponse,
  UnifiedImageEditRequest,
  UnifiedImageEditResponse,
} from '../../types/unified';
import { Router } from '../routing/router';
import { applyKeyAccessPolicy } from '../routing/key-access-policy';
import { QuotaEnforcer } from '../quota/quota-enforcer';
import { buildQuotaExceededError } from '../quota/quota-middleware';
import { TransformerFactory } from './transformer-factory';
import { logger } from '../../utils/logger';
import { QUOTA_ERROR_PATTERNS } from '../../utils/constants';
import { CooldownManager } from '../runtime/cooldown-manager';
import { StickySessionManager } from '../routing/sticky-session-manager';
import { RouteResult } from '../routing/router';
import { DebugManager } from '../observability/debug-manager';
import { UsageStorageService } from '../observability/usage-storage';
import { getConfig } from '../../config';
import { applyModelBehaviors } from '../models/model-behaviors';
import { resolveAdapters } from './adapter-resolver';
import type { ResolvedAdapter } from '../../types/provider-adapter';
import type { StallConfig } from '../inspectors/stall-inspector';
import { getGlobalStallConfig, resolveStallConfig } from '../../utils/stall';
import { VisionDescriptorService } from '../vision/vision-descriptor-service';
import { ModelMetadataManager } from '../models/model-metadata-manager';
import { enforceContextLimit } from '../models/enforce-limits';
import { DEFAULT_VISION_DESCRIPTION_PROMPT } from '../../utils/constants';
import { UsageRecord } from '../../types/usage';
import { calculateCosts } from '../../utils/calculate-costs';
import { resolveModelParams, DEFAULT_GPU_PARAMS } from '@plexus/shared';
import type { GpuParams, ModelParams } from '@plexus/shared';
import { ConcurrencyTracker } from '../runtime/concurrency-tracker';
import { sanitizeHeaders } from '../../utils/sanitize-headers';
import { getApiBaseType } from '../../utils/api-format';
import { applyRegistryAutoCompat, hasCodexResponsesExtensions } from './dispatcher-auto-compat';
import type { RetryAttemptRecord } from './dispatcher-types';
import { MediaDispatcher } from './media-dispatcher';
import {
  isClaudeMaskingApiKeyRoute,
  isOAuthRoute,
  isPiAiRoute,
  OAuthDispatcher,
} from '../oauth/oauth-dispatcher';
import { setupProviderHeaders } from '../providers/provider-request-headers';
import {
  applyGeminiThinkingConfig,
  getApiMetadata,
  resolveProviderBaseUrl,
  selectTargetApiType,
} from '../providers/provider-api-selection';
import { probeStreamingStart } from '../probes/stream-probe';
import {
  parseCooldownDurationForProvider,
  resolveCooldownProviderType,
} from '../providers/provider-cooldown';

interface ParseFailureContext {
  rawResponseText: string;
  contentType?: string | null;
}

interface RetryHistoryLikeEntry {
  reason?: unknown;
}

type ResolveTimeoutMs = (timeoutMs?: number | null) => number;

const PROVIDER_ERROR_SUMMARY_LIMIT = 500;

export class Dispatcher {
  private usageStorage?: UsageStorageService;
  private mediaDispatcher?: MediaDispatcher;
  private oauthDispatcher?: OAuthDispatcher;

  private getOAuthDispatcher(): OAuthDispatcher {
    if (!this.oauthDispatcher) {
      this.oauthDispatcher = new OAuthDispatcher({
        buildCancelledError: this.buildCancelledError.bind(this),
        enrichResponseWithMetadata: this.enrichResponseWithMetadata.bind(this),
        extractFailureReason: this.extractFailureReason.bind(this),
        formatFailureReason: this.formatFailureReason.bind(this),
        isQuotaExhaustedError: this.isQuotaExhaustedError.bind(this),
      });
    }

    return this.oauthDispatcher;
  }

  private getMediaDispatcher(): MediaDispatcher {
    if (!this.mediaDispatcher) {
      this.mediaDispatcher = new MediaDispatcher({
        resolveBaseUrl: this.resolveBaseUrl.bind(this),
        executeProviderRequest: this.executeProviderRequest.bind(this),
        handleProviderError: this.handleProviderError.bind(this),
        parseJsonResponseBody: this.parseJsonResponseBody.bind(this),
        extractResponseHeaders: this.extractResponseHeaders.bind(this),
        applyQuotaFilter: this.applyQuotaFilter.bind(this),
        appendSkippedAttempt: this.appendSkippedAttempt.bind(this),
        appendSuccessAttempt: this.appendSuccessAttempt.bind(this),
        appendFailureAttempt: this.appendFailureAttempt.bind(this),
        attachAttemptMetadata: this.attachAttemptMetadata.bind(this),
        buildAllTargetsFailedError: this.buildAllTargetsFailedError.bind(this),
        emitRoutingUpdate: this.emitRoutingUpdate.bind(this),
        recordAttemptMetric: this.recordAttemptMetric.bind(this),
        saveIntermediateError: this.saveIntermediateError.bind(this),
        formatFailureReason: this.formatFailureReason.bind(this),
        isRetryableStatus: this.isRetryableStatus.bind(this),
        isRetryableNetworkError: this.isRetryableNetworkError.bind(this),
        probeStreamingStart: this.probeStreamingStart.bind(this),
      });
    }

    return this.mediaDispatcher;
  }

  private compactProviderErrorSummary(value: unknown): string {
    const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
    const text = raw.trim() || 'Unknown provider error';
    const chars = Array.from(text);

    if (chars.length <= PROVIDER_ERROR_SUMMARY_LIMIT) {
      return text;
    }

    return `${chars.slice(0, PROVIDER_ERROR_SUMMARY_LIMIT).join('')}... [truncated ${chars.length - PROVIDER_ERROR_SUMMARY_LIMIT} chars]`;
  }

  private formatClientProviderError(statusCode: number, errorText: string): string {
    const reason = this.extractFailureReason(errorText) || errorText || 'Unknown provider error';
    return `Provider failed: ${statusCode} ${this.compactProviderErrorSummary(reason)}`;
  }

  private extractFailureReason(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          return this.extractFailureReason(parsed) || trimmed;
        } catch {
          return trimmed;
        }
      }

      return trimmed;
    }

    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const nestedError =
      record.error && typeof record.error === 'object'
        ? (record.error as Record<string, unknown>)
        : undefined;
    const nestedRoutingContext =
      record.routingContext && typeof record.routingContext === 'object'
        ? (record.routingContext as Record<string, unknown>)
        : undefined;

    const directCandidates = [
      record.errorMessage,
      nestedError?.errorMessage,
      record.message,
      nestedError?.message,
      record.providerResponse,
      record.rawResponseText,
      nestedRoutingContext?.providerResponse,
      nestedRoutingContext?.rawResponseText,
    ];

    for (const candidate of directCandidates) {
      const extracted = this.extractFailureReason(candidate);
      if (extracted) {
        return extracted;
      }
    }

    if (typeof record.retryHistory === 'string') {
      try {
        const parsed = JSON.parse(record.retryHistory) as RetryHistoryLikeEntry[];
        for (let index = parsed.length - 1; index >= 0; index--) {
          const extracted = this.extractFailureReason(parsed[index]?.reason);
          if (extracted) {
            return extracted;
          }
        }
      } catch {
        // Ignore malformed retry history strings.
      }
    }

    return undefined;
  }

  private formatFailureReason(error: any, includeStatusCode = false): string {
    const extracted =
      this.extractFailureReason(error?.routingContext?.providerResponse) ||
      this.extractFailureReason(error?.routingContext?.rawResponseText) ||
      this.extractFailureReason(error?.piAiResponse) ||
      this.extractFailureReason(error) ||
      error?.message ||
      'Unknown provider error';

    const statusCode = error?.routingContext?.statusCode ?? error?.status ?? error?.statusCode;

    if (includeStatusCode && typeof statusCode === 'number') {
      return this.compactProviderErrorSummary(`HTTP ${statusCode}: ${extracted}`);
    }

    return this.compactProviderErrorSummary(extracted);
  }

  private async recordAttemptMetric(
    route: RouteResult,
    requestId: string | undefined,
    success: boolean,
    metadata?: {
      isVisionFallthrough?: boolean;
      isDescriptorRequest?: boolean;
      visionFallthroughModel?: string;
    }
  ): Promise<void> {
    if (!this.usageStorage) return;

    const metricRequestId =
      requestId || `failover-attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (success) {
      await this.usageStorage.recordSuccessfulAttempt(
        route.provider,
        route.model,
        route.canonicalModel ?? null,
        metricRequestId,
        metadata
      );
      return;
    }

    await this.usageStorage.recordFailedAttempt(
      route.provider,
      route.model,
      route.canonicalModel ?? null,
      metricRequestId,
      metadata
    );
  }

  setUsageStorage(storage: UsageStorageService) {
    this.usageStorage = storage;
  }

  private saveIntermediateError(requestId: string | undefined, apiType: string, error: any): void {
    if (!this.usageStorage || !requestId) return;
    this.usageStorage.saveError(requestId, error, {
      apiType,
      ...(error?.routingContext || {}),
    });
  }

  /**
   * Emit an early routing update so the frontend shows provider/model immediately.
   * The route handler emits a second update after dispatch, but for non-streaming
   * requests that can be seconds later — this one fires as soon as routing is done.
   */
  private emitRoutingUpdate(requestId: string | undefined, route: RouteResult): void {
    if (!requestId || !this.usageStorage) return;
    this.usageStorage.emitUpdatedAsync({
      requestId,
      provider: route.provider,
      selectedModelName: route.model,
      canonicalModelName: route.canonicalModel,
    });
  }

  /**
   * Persist the (alias, sessionKey) → (provider, model) mapping after a
   * successful dispatch so the next turn of this conversation can prefer the
   * same target. No-op when stickiness doesn't apply (no session key, no
   * canonical alias, or vision-descriptor sub-request).
   */
  private recordStickySession(
    sessionKey: string | null,
    route: RouteResult,
    request: UnifiedChatRequest
  ): void {
    if (!sessionKey || !route.canonicalModel) return;
    if ((request as any)._isVisionDescriptorRequest) return;
    const aliasConfig = getConfig().models?.[route.canonicalModel];
    if (!aliasConfig?.sticky_session) return;
    StickySessionManager.getInstance().set(
      route.canonicalModel,
      request.incomingApiType || 'chat',
      sessionKey,
      route.provider,
      route.model
    );
  }

  async dispatch(
    request: UnifiedChatRequest,
    signal?: AbortSignal,
    resolveTimeoutMs?: ResolveTimeoutMs,
    addStallConfig?: (providerOverrides: {
      stallTtfbMs?: number | null;
      stallTtfbBytes?: number | null;
      stallMinBps?: number | null;
      stallWindowMs?: number | null;
      stallGracePeriodMs?: number | null;
    }) => void
  ): Promise<UnifiedChatResponse> {
    const config = getConfig();
    const failover = config.failover;
    const failoverEnabled = failover?.enabled !== false;

    // 1. Route (ordered candidates)
    const sessionKey = StickySessionManager.computeSessionKey(request);
    let candidates = await Router.resolveCandidates(
      request.model,
      request.incomingApiType,
      sessionKey
    );

    // Fallback for direct/provider/model syntax and legacy single-route behavior
    if (candidates.length === 0) {
      const singleRoute = await Router.resolve(request.model, request.incomingApiType);
      candidates = [singleRoute];
    }

    if (candidates.length === 0) {
      throw new Error(`No route candidates found for model '${request.model}'`);
    }

    candidates = applyKeyAccessPolicy(request, candidates, request.incomingApiType || 'chat');

    const retryHistory: RetryAttemptRecord[] = [];
    candidates = this.applyQuotaFilter(
      request,
      candidates,
      retryHistory,
      request.incomingApiType || 'chat'
    );

    const targets = failoverEnabled ? candidates : [candidates[0]!];
    const attemptedProviders: string[] = [];
    let lastError: any = null;

    // Check if this is already a vision descriptor request to prevent recursion
    const isVisionDescriptorRequest = (request as any)._isVisionDescriptorRequest === true;

    for (let i = 0; i < targets.length; i++) {
      if (signal?.aborted) throw this.buildCancelledError(signal);
      let currentRequest = { ...request };
      const route = targets[i]!;
      const apiSelection = this.selectTargetApiType(route, currentRequest.incomingApiType);
      if (!apiSelection.targetApiType) {
        const reason = apiSelection.selectionReason;
        logger.info(`Skipping ${route.provider}/${route.model} - ${reason}`);
        lastError = new Error(reason);
        this.appendSkippedAttempt(retryHistory, route, reason, currentRequest.incomingApiType);
        continue;
      }
      const { targetApiType, selectionReason } = apiSelection;
      const attemptTimeout = this.createAttemptTimeout(
        signal,
        route.config.timeoutMs,
        resolveTimeoutMs
      );

      // Vision Fallthrough (Image-to-Text Preprocessing)
      // Check if:
      // 1. Opt-in is enabled for this alias
      // 2. We're not already in a descriptor call (recursion guard)
      // 3. Request contains images
      // Look up use_image_fallthrough from the alias configuration (not provider's model config)
      const aliasConfig = route.canonicalModel ? config.models?.[route.canonicalModel] : undefined;
      const hasImages = VisionDescriptorService.hasImages(currentRequest.messages);
      logger.debug(
        `Checking: canonicalModel='${route.canonicalModel}', use_image_fallthrough='${aliasConfig?.use_image_fallthrough}', hasImages='${hasImages}', isVisionDescriptorRequest='${isVisionDescriptorRequest}'`
      );
      if (!isVisionDescriptorRequest && aliasConfig?.use_image_fallthrough && hasImages) {
        const vfConfig = config.vision_fallthrough;
        if (vfConfig?.descriptor_model) {
          try {
            logger.debug(
              `Before process: ${JSON.stringify(currentRequest.messages.map((m) => ({ role: m.role, contentCount: Array.isArray(m.content) ? m.content.length : 'string' })))}`
            );
            currentRequest = await VisionDescriptorService.process(
              currentRequest,
              vfConfig.descriptor_model,
              vfConfig.default_prompt || DEFAULT_VISION_DESCRIPTION_PROMPT,
              this.usageStorage // Pass usage storage to record descriptor call
            );
            logger.debug(
              `After process: ${JSON.stringify(currentRequest.messages.map((m) => ({ role: m.role, contentCount: Array.isArray(m.content) ? m.content.length : 'string' })))}`
            );

            // Verify if images are actually gone in the modified request
            const stillHasImages = VisionDescriptorService.hasImages(currentRequest.messages);
            if (stillHasImages) {
              logger.error(
                `CRITICAL: VisionDescriptorService.process returned a request that STILL contains images!`
              );
            }

            // Tag the request as having undergone fallthrough
            (currentRequest as any)._hasVisionFallthrough = true;
            (currentRequest as any)._visionFallthroughModel = vfConfig.descriptor_model;
            logger.debug(`Successfully preprocessed images for ${route.provider}/${route.model}`);
          } catch (vfError) {
            logger.error(`Error in descriptor service:`, vfError);
          }
        } else {
          logger.warn(
            `Feature enabled for alias '${request.model}' but 'vision_fallthrough.descriptor_model' not configured globally.`
          );
        }
      }

      // Re-check cooldown status before attempting this target
      const isHealthy = await CooldownManager.getInstance().isProviderHealthy(
        route.provider,
        route.model
      );
      if (!isHealthy) {
        attemptTimeout.cleanup();
        logger.warn(`Skipping ${route.provider}/${route.model} - provider is on cooldown`);
        lastError = new Error(`Provider ${route.provider}/${route.model} is on cooldown`);
        this.appendSkippedAttempt(
          retryHistory,
          route,
          `Provider ${route.provider}/${route.model} is on cooldown`
        );
        continue;
      }

      // Pre-dispatch context limit enforcement (opt-in per alias). Runs on
      // the finalized per-target request — after any vision fallthrough has
      // expanded the prompt and after cooldown has selected a live target —
      // so we reject oversized prompts locally with a 400 instead of
      // burning an upstream round trip on a guaranteed failure. Checked
      // BEFORE acquiring a concurrency slot so that a thrown
      // ContextLengthExceededError (a client-side problem; failing over to
      // another target won't help) never leaks an acquired slot.
      if (aliasConfig?.enforce_limits && route.canonicalModel) {
        enforceContextLimit(currentRequest, aliasConfig, route.canonicalModel);
      }

      // Acquire concurrency slot before upstream request
      const acquired = ConcurrencyTracker.getInstance().acquire(route.provider, route.model);
      if (!acquired) {
        attemptTimeout.cleanup();
        logger.warn(`Skipping ${route.provider}/${route.model} - concurrency limit exceeded`);
        lastError = new Error(
          `Provider ${route.provider}/${route.model} concurrency limit exceeded`
        );
        this.appendSkippedAttempt(
          retryHistory,
          route,
          `Provider ${route.provider}/${route.model} concurrency limit exceeded`
        );
        continue;
      }

      attemptedProviders.push(`${route.provider}/${route.model}`);

      let released = false;
      const doRelease = () => {
        if (!released) {
          released = true;
          ConcurrencyTracker.getInstance().release(route.provider, route.model);
        }
      };

      this.emitRoutingUpdate(currentRequest.requestId, route);

      try {
        // Determine Target API Type
        logger.info(
          `Dispatcher: Selected API type '${targetApiType}' for model '${route.model}'. Reason: ${selectionReason}`
        );

        // 2. Get Transformer
        const transformerType = this.isPiAiRoute(route, targetApiType) ? 'oauth' : targetApiType;
        const transformer = TransformerFactory.getTransformer(transformerType);

        // 3. Transform Request
        const requestWithTargetModel = { ...currentRequest, model: route.model };

        // Resolve adapters for this specific provider+model combination
        const adapters = resolveAdapters(route);

        const { payload: providerPayload, bypassTransformation } =
          await this.transformRequestPayload(
            requestWithTargetModel,
            route,
            transformer,
            targetApiType,
            adapters
          );

        // Capture transformed request
        if (currentRequest.requestId) {
          DebugManager.getInstance().addTransformedRequest(
            currentRequest.requestId,
            providerPayload
          );
        }

        // Wire per-provider stall detection overrides. Always call addStallConfig
        // so the StallInspector is reset on each failover iteration — even when
        // the current provider has no overrides, this clears a previous provider's
        // overrides from the inspector.
        if (addStallConfig) {
          const providerStallOverrides: Parameters<typeof addStallConfig>[0] = {};
          if (route.config.stallTtfbMs !== undefined)
            providerStallOverrides.stallTtfbMs = route.config.stallTtfbMs;
          if (route.config.stallTtfbBytes !== undefined)
            providerStallOverrides.stallTtfbBytes = route.config.stallTtfbBytes;
          if (route.config.stallMinBps !== undefined)
            providerStallOverrides.stallMinBps = route.config.stallMinBps;
          if (route.config.stallWindowMs !== undefined)
            providerStallOverrides.stallWindowMs = route.config.stallWindowMs;
          if (route.config.stallGracePeriodMs !== undefined)
            providerStallOverrides.stallGracePeriodMs = route.config.stallGracePeriodMs;
          logger.debug(
            `Dispatcher: provider stall overrides for ${route.provider}: ${JSON.stringify(providerStallOverrides)}, ` +
              `route.config stall fields: stallTtfbMs=${route.config.stallTtfbMs}, stallMinBps=${route.config.stallMinBps}`
          );
          addStallConfig(providerStallOverrides);
        }

        // Resolve stall config BEFORE the dispatch so we can wrap fetch+probe
        // in a TTFB timeout. This is critical because fetch() itself may block
        // for a long time waiting for HTTP response headers — the TTFB timeout
        // must cover this "headers phase" too, not just the body reading.
        // This applies to BOTH OAuth and non-OAuth routes.
        let effectiveStallConfig = resolveStallConfig(getGlobalStallConfig(), {
          stallTtfbMs: route.config.stallTtfbMs,
          stallTtfbBytes: route.config.stallTtfbBytes,
          stallMinBps: route.config.stallMinBps,
          stallWindowMs: route.config.stallWindowMs,
          stallGracePeriodMs: route.config.stallGracePeriodMs,
        });

        logger.debug(
          `Dispatcher: effectiveStallConfig for ${route.provider}: ${JSON.stringify(effectiveStallConfig)}, ` +
            `route.config.stallTtfbMs=${route.config.stallTtfbMs}, route.config.stallMinBps=${route.config.stallMinBps}`
        );

        if (this.isPiAiRoute(route, targetApiType)) {
          try {
            const oauthResponse = await this.dispatchOAuthRequest(
              providerPayload,
              currentRequest,
              route,
              targetApiType,
              transformer,
              attemptTimeout.signal,
              effectiveStallConfig
            );
            attemptTimeout.cleanup();
            await this.recordAttemptMetric(route, currentRequest.requestId, true, {
              isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
              isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
              visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
            });
            this.appendSuccessAttempt(retryHistory, route, targetApiType);
            this.attachAttemptMetadata(
              oauthResponse,
              attemptedProviders,
              retryHistory,
              route,
              targetApiType
            );
            try {
              CooldownManager.getInstance().markProviderSuccess(route.provider, route.model);
              this.recordStickySession(sessionKey, route, currentRequest);
              return oauthResponse;
            } finally {
              doRelease();
            }
          } catch (oauthError: any) {
            const effectiveOAuthError = attemptTimeout.isTimedOut()
              ? this.buildTimeoutError()
              : oauthError;
            if (signal?.aborted) throw this.buildCancelledError(signal);
            lastError = effectiveOAuthError;

            // Handle TTFB stall errors with failover support
            const isStallError = (effectiveOAuthError as any).isStallError === true;
            if (isStallError) {
              const canRetryStall = failoverEnabled && i < targets.length - 1;
              this.appendFailureAttempt(
                retryHistory,
                route,
                effectiveOAuthError,
                targetApiType,
                canRetryStall
              );

              if (canRetryStall) {
                attemptTimeout.cleanup();
                await this.recordAttemptMetric(route, currentRequest.requestId, false, {
                  isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
                  isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
                  visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
                });
                CooldownManager.getInstance().markProviderStallFailure(
                  route.provider,
                  route.model,
                  this.formatFailureReason(effectiveOAuthError)
                );
                this.saveIntermediateError(
                  currentRequest.requestId,
                  targetApiType || 'chat',
                  effectiveOAuthError
                );
                logger.info(
                  `TTFB stall: OAuth request timed out for ${route.provider}/${route.model}, retrying`
                );
                doRelease();
                continue;
              }

              doRelease();

              // Mark stall failure for cooldown tracking even on the last target
              CooldownManager.getInstance().markProviderStallFailure(
                route.provider,
                route.model,
                this.formatFailureReason(effectiveOAuthError)
              );
              throw effectiveOAuthError;
            }

            const canRetry =
              failoverEnabled &&
              i < targets.length - 1 &&
              (attemptTimeout.isTimedOut() || this.isRetryableOAuthError(effectiveOAuthError));

            this.appendFailureAttempt(
              retryHistory,
              route,
              effectiveOAuthError,
              targetApiType,
              canRetry
            );

            if (canRetry) {
              attemptTimeout.cleanup();
              await this.recordAttemptMetric(route, currentRequest.requestId, false, {
                isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
                isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
                visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
              });
              await this.markOAuthProviderFailure(route, effectiveOAuthError);
              this.saveIntermediateError(
                currentRequest.requestId,
                targetApiType || 'chat',
                effectiveOAuthError
              );
              logger.warn(
                `Failover: retrying after OAuth error from ${route.provider}/${route.model}: ${effectiveOAuthError.message}`
              );
              doRelease();
              continue;
            }

            attemptTimeout.cleanup();
            await this.markOAuthProviderFailure(route, effectiveOAuthError);
            doRelease();
            throw effectiveOAuthError;
          }
        }

        // 4. Execute Request (non-OAuth)
        const incomingApi = currentRequest.incomingApiType || 'unknown';
        const url = this.buildRequestUrl(route, transformer, requestWithTargetModel, targetApiType);
        const headers = this.setupHeaders(route, targetApiType, requestWithTargetModel);

        logger.info(
          `Dispatching ${currentRequest.model} to ${route.provider}:${route.model} ${incomingApi} <-> ${transformer.name}`
        );

        logger.silly('Upstream Request Payload', providerPayload);

        // When TTFB stall detection is configured for streaming requests, wrap
        // the fetch + probe in a single timeout that covers the entire TTFB
        // window (from request dispatch to receiving ttfbBytes of body data).
        // This handles the case where fetch() itself blocks for a long time
        // waiting for HTTP response headers from a slow provider.
        let response: Response;
        let stallAbortController: AbortController | undefined;
        let ttfbTimerId: ReturnType<typeof setTimeout> | undefined;
        const dispatchStartTime = Date.now();

        if (currentRequest.stream && effectiveStallConfig?.ttfbMs != null) {
          // Create a separate AbortController for the TTFB stall timeout.
          // We don't use the route's abortController because an abort there
          // means the client disconnected — we need a distinct signal for
          // "provider is too slow to start responding".
          stallAbortController = new AbortController();
          const combinedSignal = AbortSignal.any([
            attemptTimeout.signal,
            stallAbortController.signal,
          ]);

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

          try {
            response = await this.executeProviderRequest(
              url,
              headers,
              providerPayload,
              combinedSignal
            );
          } catch (fetchError: any) {
            // Client disconnected takes priority over stall detection —
            // if the client is gone, no point retrying.
            if (signal?.aborted) {
              clearTimeout(ttfbTimerId);
              throw this.buildCancelledError(signal);
            }

            // If the error was caused by our TTFB stall timeout, synthesize
            // a stall result instead of treating it as a generic network error.
            if (stallAbortController.signal.aborted) {
              clearTimeout(ttfbTimerId);
              const stallError = new Error(
                `Stream stalled: TTFB timeout — no response within ${ttfbMs}ms`
              );
              lastError = stallError;

              const canRetryStall =
                failoverEnabled &&
                i < targets.length - 1 &&
                (this.isRetryableNetworkError(stallError, failover?.retryableErrors || []) ||
                  stallError.message?.includes('stalled'));

              if (canRetryStall) {
                attemptTimeout.cleanup();
                await this.recordAttemptMetric(route, currentRequest.requestId, false, {
                  isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
                  isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
                  visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
                });
                this.appendFailureAttempt(retryHistory, route, stallError, targetApiType, true);
                CooldownManager.getInstance().markProviderStallFailure(
                  route.provider,
                  route.model,
                  this.formatFailureReason(stallError)
                );
                this.saveIntermediateError(
                  currentRequest.requestId,
                  targetApiType || 'chat',
                  stallError
                );
                logger.info(
                  `TTFB stall: fetch timed out after ${ttfbMs}ms for ${route.provider}/${route.model}, retrying with next provider`
                );
                doRelease();
                continue;
              }
              doRelease();
              throw stallError;
            }
            throw fetchError;
          }

          // Fetch returned — clear the TTFB timer (we beat the timeout)
          clearTimeout(ttfbTimerId);
          ttfbTimerId = undefined;

          // Adjust the stall config's ttfbMs for the probe — subtract the time
          // already spent waiting for fetch() to return. The probe only needs
          // to cover the remaining time until the byte threshold is met.
          const fetchElapsed = Date.now() - dispatchStartTime;
          const remainingTtfbMs = Math.max(0, ttfbMs - fetchElapsed);
          if (remainingTtfbMs <= 0 && effectiveStallConfig) {
            // Fetch returned just barely within the TTFB window — no time left
            // for the probe. Skip the probe and let the pipeline handle it.
            effectiveStallConfig = { ...effectiveStallConfig, ttfbMs: null };
          } else if (effectiveStallConfig) {
            effectiveStallConfig = { ...effectiveStallConfig, ttfbMs: remainingTtfbMs };
          }
        } else {
          response = await this.executeProviderRequest(
            url,
            headers,
            providerPayload,
            attemptTimeout.signal
          );
        }

        if (!response.ok) {
          const errorText = await response.text();
          const canRetry =
            failoverEnabled &&
            i < targets.length - 1 &&
            this.isRetryableStatus(response.status, failover?.retryableStatusCodes || []);

          try {
            await this.handleProviderError(
              response,
              route,
              errorText,
              url,
              headers,
              targetApiType,
              currentRequest.requestId
            );
          } catch (e: any) {
            if (signal?.aborted) throw this.buildCancelledError(signal);
            lastError = e;
            this.appendFailureAttempt(retryHistory, route, e, targetApiType, canRetry);

            if (canRetry) {
              attemptTimeout.cleanup();
              doRelease();
              await this.recordAttemptMetric(route, currentRequest.requestId, false, {
                isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
                isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
                visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
              });
              // Only mark as failed if the error actually triggered a cooldown (i.e., it's not a caller error like validation)
              // Caller errors (400 validation errors, 413, 422) should not cause cooldown
              if (e?.routingContext?.cooldownTriggered) {
                CooldownManager.getInstance().markProviderFailure(
                  route.provider,
                  route.model,
                  undefined,
                  this.formatFailureReason(e, true)
                );
              }
              this.saveIntermediateError(currentRequest.requestId, targetApiType || 'chat', e);
              logger.warn(
                `Failover: retrying after HTTP ${response.status} from ${route.provider}/${route.model}`
              );
              continue;
            }

            doRelease();
            throw e;
          }
        }

        // 5. Handle Response
        if (currentRequest.stream) {
          // effectiveStallConfig was already computed before the fetch above.
          // If TTFB stall is still active (fetch returned within TTFB but body
          // hasn't met the byte threshold yet), the probe will continue checking.
          const streamProbe = await this.probeStreamingStart(response, effectiveStallConfig);

          if (!streamProbe.ok) {
            const error = streamProbe.error;
            lastError = error;

            const canRetry =
              failoverEnabled &&
              i < targets.length - 1 &&
              !streamProbe.streamStarted &&
              (this.isRetryableNetworkError(error, failover?.retryableErrors || []) ||
                error.message?.includes('stalled'));

            if (canRetry) {
              attemptTimeout.cleanup();
              await this.recordAttemptMetric(route, currentRequest.requestId, false, {
                isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
                isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
                visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
              });
              this.appendFailureAttempt(retryHistory, route, error, targetApiType, true);
              if (error.message?.includes('stalled')) {
                CooldownManager.getInstance().markProviderStallFailure(
                  route.provider,
                  route.model,
                  this.formatFailureReason(error)
                );
              } else {
                CooldownManager.getInstance().markProviderFailure(
                  route.provider,
                  route.model,
                  undefined,
                  this.formatFailureReason(error)
                );
              }
              this.saveIntermediateError(currentRequest.requestId, targetApiType || 'chat', error);
              logger.warn(
                `Failover: retrying stream before first byte after ${route.provider}/${route.model} failure: ${error.message}`
              );
              doRelease();
              continue;
            }

            doRelease();
            throw error;
          }

          const streamResponse = this.handleStreamingResponse(
            streamProbe.response,
            currentRequest,
            route,
            targetApiType,
            bypassTransformation,
            adapters
          );

          // Wrap the stream to release the concurrency slot when the stream
          // is fully consumed, cancelled, or errors out. Without this, the
          // slot would never be released for streaming responses.
          if (streamResponse.stream) {
            const originalStream = streamResponse.stream;
            const reader = originalStream.getReader();
            let released = false;
            const release = () => {
              if (!released) {
                released = true;
                reader.releaseLock();
                doRelease();
              }
            };
            streamResponse.stream = new ReadableStream({
              async pull(controller) {
                try {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.close();
                    release();
                  } else {
                    controller.enqueue(value);
                  }
                } catch (e) {
                  controller.error(e);
                  release();
                }
              },
              cancel(reason) {
                release();
                return originalStream.cancel(reason);
              },
            });
          }

          await this.recordAttemptMetric(route, currentRequest.requestId, true, {
            isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
            isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
            visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
          });
          CooldownManager.getInstance().markProviderSuccess(route.provider, route.model);
          this.recordStickySession(sessionKey, route, currentRequest);
          this.appendSuccessAttempt(retryHistory, route, targetApiType);
          this.attachAttemptMetadata(
            streamResponse,
            attemptedProviders,
            retryHistory,
            route,
            targetApiType
          );
          attemptTimeout.cleanup();
          return streamResponse;
        }

        const nonStreamingResponse = await this.handleNonStreamingResponse(
          response,
          currentRequest,
          route,
          targetApiType,
          transformer,
          bypassTransformation,
          adapters
        );
        await this.recordAttemptMetric(route, currentRequest.requestId, true, {
          isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
          isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
          visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
        });

        if ((currentRequest as any)._isVisionDescriptorRequest && this.usageStorage) {
          // ... (this part is fine)
        }

        CooldownManager.getInstance().markProviderSuccess(route.provider, route.model);
        this.recordStickySession(sessionKey, route, currentRequest);
        this.appendSuccessAttempt(retryHistory, route, targetApiType);
        this.attachAttemptMetadata(
          nonStreamingResponse,
          attemptedProviders,
          retryHistory,
          route,
          targetApiType
        );
        doRelease();
        attemptTimeout.cleanup();
        return nonStreamingResponse;
      } catch (error: any) {
        const effectiveError = attemptTimeout.isTimedOut() ? this.buildTimeoutError() : error;
        lastError = effectiveError;
        attemptTimeout.cleanup();
        doRelease();

        // If the client disconnected (abort signal), don't treat this as a
        // retryable error — throw a proper client_disconnected error so the
        // route handler records it as cancelled, not as an inference error.
        if (signal?.aborted) throw this.buildCancelledError(signal);

        // If the error came from handleProviderError, it already called markProviderFailure.
        // Only call it here for network/transport errors that have no HTTP status code.
        const isHttpError = effectiveError?.routingContext?.statusCode !== undefined;
        const isUpstreamTimeout = effectiveError?.routingContext?.code === 'upstream_timeout';

        if (!isHttpError || isUpstreamTimeout) {
          // Pure network/transport error — mark the provider as failed
          if (effectiveError.message?.includes('stalled')) {
            CooldownManager.getInstance().markProviderStallFailure(
              route.provider,
              route.model,
              this.formatFailureReason(effectiveError)
            );
          } else {
            CooldownManager.getInstance().markProviderFailure(
              route.provider,
              route.model,
              undefined,
              this.formatFailureReason(effectiveError)
            );
          }
        }
        await this.recordAttemptMetric(route, currentRequest.requestId, false, {
          isVisionFallthrough: (currentRequest as any)._hasVisionFallthrough,
          isDescriptorRequest: (currentRequest as any)._isVisionDescriptorRequest,
          visionFallthroughModel: (currentRequest as any)._visionFallthroughModel,
        });

        const canRetryNetwork =
          failoverEnabled &&
          i < targets.length - 1 &&
          (isUpstreamTimeout ||
            this.isRetryableNetworkError(effectiveError, failover?.retryableErrors || []) ||
            effectiveError.message?.includes('stalled'));

        this.appendFailureAttempt(retryHistory, route, effectiveError, undefined, canRetryNetwork);

        if (canRetryNetwork) {
          this.saveIntermediateError(
            currentRequest.requestId,
            effectiveError?.routingContext?.targetApiType || 'chat',
            effectiveError
          );
          logger.warn(
            `Failover: retrying after network/transport error from ${route.provider}/${route.model}: ${effectiveError.message}`
          );
          continue;
        }

        throw this.buildAllTargetsFailedError(lastError, attemptedProviders, retryHistory);
      }
    }

    throw this.buildAllTargetsFailedError(lastError, attemptedProviders, retryHistory);
  }

  private isRetryableStatus(statusCode: number, retryableStatusCodes: number[]): boolean {
    return retryableStatusCodes.includes(statusCode);
  }

  /**
   * Determines if an OAuth error is retryable.
   * Retryable errors include network issues, rate limiting, and transient failures.
   */
  private isRetryableOAuthError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const statusCode = error.status || error.statusCode;

    // Retry on network errors (no status code means network failure)
    if (!statusCode) {
      return true;
    }

    // Retry on 5xx server errors
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Retry on 429 rate limiting
    if (statusCode === 429) {
      return true;
    }

    // Retry on specific transient error messages
    const retryablePatterns = [
      'timeout',
      'econnrefused',
      'ECONNREFUSED',
      'etimedout',
      'ETIMEDOUT',
      'network',
      'socket',
      'temporary',
      'unavailable',
      'service unavailable',
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  private isRetryableNetworkError(error: any, retryableErrors: string[]): boolean {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || '').toUpperCase();
    return retryableErrors.some((token) => {
      const normalized = token.toUpperCase();
      return code.includes(normalized) || message.includes(normalized);
    });
  }

  private async probeStreamingStart(
    response: Response,
    stallConfig?: StallConfig | null
  ): Promise<
    { ok: true; response: Response } | { ok: false; error: Error; streamStarted: boolean }
  > {
    return probeStreamingStart(response, stallConfig);
  }

  private attachAttemptMetadata(
    response: any,
    attemptedProviders: string[],
    retryHistory: RetryAttemptRecord[],
    finalRoute: RouteResult,
    apiType: string
  ): void {
    const responseApiType = response?.plexus?.apiType;

    response.plexus = {
      ...(response.plexus || {}),
      attemptCount: attemptedProviders.length,
      finalAttemptProvider: finalRoute.provider,
      finalAttemptModel: finalRoute.model,
      allAttemptedProviders: JSON.stringify(attemptedProviders),
      retryHistory: JSON.stringify(retryHistory),
      canonicalModel: finalRoute.canonicalModel,
      provider: finalRoute.provider,
      model: finalRoute.model,
      // Preserve the response-declared API type (e.g. oauth) so downstream
      // stream transformation uses the correct transformer.
      apiType: responseApiType || apiType,
      pricing: finalRoute.modelConfig?.pricing,
      providerDiscount: finalRoute.config.discount,
      config: {
        estimateTokens: finalRoute.config.estimateTokens,
      },
      // GPU params — read directly from the resolved numeric fields.
      // The frontend (or config hydration) resolves named profiles to concrete
      // values before they reach this point. Fall back to H100 only if no GPU
      // fields are set at all (i.e. no GPU profile was configured).
      gpuParams: {
        ram_gb: finalRoute.config.gpu_ram_gb ?? DEFAULT_GPU_PARAMS.ram_gb,
        bandwidth_tb_s: finalRoute.config.gpu_bandwidth_tb_s ?? DEFAULT_GPU_PARAMS.bandwidth_tb_s,
        flops_tflop: finalRoute.config.gpu_flops_tflop ?? DEFAULT_GPU_PARAMS.flops_tflop,
        power_draw_watts:
          finalRoute.config.gpu_power_draw_watts ?? DEFAULT_GPU_PARAMS.power_draw_watts,
      },
      modelParams: resolveModelParams(finalRoute.modelArchitecture),
    } as any;
  }

  private appendSkippedAttempt(
    retryHistory: RetryAttemptRecord[],
    route: RouteResult,
    reason: string,
    apiType?: string
  ): void {
    retryHistory.push({
      index: retryHistory.length + 1,
      provider: route.provider,
      model: route.model,
      apiType,
      status: 'skipped',
      reason,
      retryable: false,
    });
  }

  /**
   * Quota-aware candidate filter. Reads the QuotaContext attached by
   * `attachQuotaContext` (quota-middleware.ts) at
   * `metadata.plexus_metadata.plexus_quota_context` — absent whenever the
   * caller never attached one (no quota assigned, or one of the non-chat
   * dispatch paths that doesn't attach a context at all) — in which case
   * this is a no-op and `candidates` is returned unchanged.
   *
   * Candidates blocked by a scope-matching exhausted quota are dropped and
   * recorded as `skipped` retryHistory entries (reason
   * `quota_exceeded:<quotaName>`) — routing silently narrows to the
   * remaining candidates. Only when EVERY candidate ends up blocked does
   * this throw a terminal `buildQuotaExceededError`, carrying every
   * blocking snapshot so the 429 body's `blocking_quotas` reflects the full
   * set.
   */
  private applyQuotaFilter<C extends RouteResult>(
    request: { metadata?: Record<string, any> },
    candidates: C[],
    retryHistory: RetryAttemptRecord[],
    apiType?: string
  ): C[] {
    const ctx = request.metadata?.plexus_metadata?.plexus_quota_context ?? null;
    if (!ctx) return candidates;

    const { allowed, blocked } = QuotaEnforcer.filterCandidates(ctx, candidates);
    if (blocked.length === 0) return candidates;

    for (const { candidate, quota } of blocked) {
      this.appendSkippedAttempt(
        retryHistory,
        candidate,
        `quota_exceeded:${quota.quotaName}`,
        apiType
      );
    }

    if (allowed.length === 0) {
      // Terminal: keep the quota-skip breadcrumbs on the error so the saved
      // UsageRecord's retryHistory isn't null when everything was blocked.
      throw buildQuotaExceededError(
        blocked.map((b) => b.quota),
        retryHistory
      );
    }

    return allowed;
  }

  private appendSuccessAttempt(
    retryHistory: RetryAttemptRecord[],
    route: RouteResult,
    apiType?: string
  ): void {
    retryHistory.push({
      index: retryHistory.length + 1,
      provider: route.provider,
      model: route.model,
      apiType,
      status: 'success',
      reason: 'Request completed successfully',
      retryable: false,
    });
  }

  private appendFailureAttempt(
    retryHistory: RetryAttemptRecord[],
    route: RouteResult,
    error: any,
    apiType?: string,
    retryable?: boolean
  ): void {
    const statusCode = error?.routingContext?.statusCode ?? error?.status ?? error?.statusCode;
    const reason = this.formatFailureReason(error);

    retryHistory.push({
      index: retryHistory.length + 1,
      provider: route.provider,
      model: route.model,
      apiType,
      status: 'failed',
      reason,
      statusCode: typeof statusCode === 'number' ? statusCode : undefined,
      retryable,
      providerResponseHeaders: error?.routingContext?.providerResponseHeaders,
    });
  }

  private buildAllTargetsFailedError(
    lastError: any,
    attemptedProviders: string[],
    retryHistory: RetryAttemptRecord[] = []
  ): Error {
    const summary = attemptedProviders.length > 0 ? attemptedProviders.join(', ') : 'none';
    const baseMessage = this.compactProviderErrorSummary(
      this.formatFailureReason(lastError) || lastError?.message || 'Unknown provider error'
    );
    const enriched = new Error(`All targets failed: ${summary}. Last error: ${baseMessage}`) as any;

    enriched.cause = lastError;
    enriched.routingContext = {
      ...(lastError?.routingContext || {}),
      allAttemptedProviders: attemptedProviders,
      attemptCount: attemptedProviders.length,
      retryHistory: JSON.stringify(retryHistory),
      statusCode: lastError?.routingContext?.statusCode || 500,
    };

    return enriched;
  }

  private async parseJsonResponseBody(
    response: Response,
    requestId?: string,
    route?: RouteResult,
    targetApiType?: string
  ): Promise<any> {
    const responseText = await response.text();

    try {
      return JSON.parse(responseText);
    } catch (cause) {
      if (requestId) {
        DebugManager.getInstance().addRawResponse(requestId, responseText);
        DebugManager.getInstance().addReconstructedRawResponse(requestId, {
          parseError: true,
          rawResponseText: responseText,
          contentType: response.headers.get('content-type'),
          provider: route?.provider,
          targetModel: route?.model,
          targetApiType,
        });
      }

      const error = new Error(
        responseText || 'JSON Parse error: Unable to parse JSON string'
      ) as any;
      error.cause = cause;
      error.routingContext = {
        provider: route?.provider,
        targetModel: route?.model,
        targetApiType,
        statusCode: response.status || 500,
        rawResponseText: responseText,
        providerResponse: responseText,
        contentType: response.headers.get('content-type'),
      } satisfies ParseFailureContext & Record<string, unknown>;

      throw error;
    }
  }

  setupHeaders(
    route: RouteResult,
    apiType: string,
    request: UnifiedChatRequest
  ): Record<string, string> {
    return setupProviderHeaders(route, apiType, request);
  }

  private getApiMetadata(metadata: Record<string, any>): Record<string, any> {
    return getApiMetadata(metadata);
  }

  private selectTargetApiType(
    route: RouteResult,
    incomingApiType?: string
  ): { targetApiType?: string; selectionReason: string } {
    return selectTargetApiType(route, incomingApiType);
  }

  private resolveBaseUrl(route: RouteResult, targetApiType: string): string {
    return resolveProviderBaseUrl(route, targetApiType);
  }

  private applyGeminiThinkingConfig(route: RouteResult, targetApiType: string, payload: any): any {
    return applyGeminiThinkingConfig(route, targetApiType, payload);
  }

  private isOAuthRoute(route: RouteResult, targetApiType: string): boolean {
    return isOAuthRoute(route, targetApiType);
  }

  private isClaudeMaskingApiKeyRoute(route: RouteResult, targetApiType: string): boolean {
    return isClaudeMaskingApiKeyRoute(route, targetApiType);
  }

  private isPiAiRoute(route: RouteResult, targetApiType: string): boolean {
    return isPiAiRoute(route, targetApiType);
  }

  private async probeOAuthStreamStart(
    stream: ReadableStream<any>,
    stallConfig?: StallConfig | null
  ): Promise<
    { ok: true; stream: ReadableStream<any> } | { ok: false; error: Error; streamStarted: boolean }
  > {
    return this.getOAuthDispatcher().probeOAuthStreamStart(stream, stallConfig);
  }

  private async dispatchOAuthRequest(
    context: any,
    request: UnifiedChatRequest,
    route: RouteResult,
    targetApiType: string,
    transformer: any,
    signal?: AbortSignal,
    effectiveStallConfig?: StallConfig | null
  ): Promise<UnifiedChatResponse> {
    return this.getOAuthDispatcher().dispatchOAuthRequest(
      context,
      request,
      route,
      targetApiType,
      transformer,
      signal,
      effectiveStallConfig
    );
  }

  private wrapOAuthError(error: Error, route: RouteResult, targetApiType: string): Error {
    return this.getOAuthDispatcher().wrapOAuthError(error, route, targetApiType);
  }

  private async markOAuthProviderFailure(route: RouteResult, oauthError: any): Promise<void> {
    return this.getOAuthDispatcher().markOAuthProviderFailure(route, oauthError);
  }

  private createAttemptTimeout(
    signal: AbortSignal | undefined,
    providerTimeoutMs: number | null | undefined,
    resolveTimeoutMs?: ResolveTimeoutMs
  ): { signal: AbortSignal; isTimedOut: () => boolean; cleanup: () => void } {
    const timeoutMs = resolveTimeoutMs
      ? resolveTimeoutMs(providerTimeoutMs ?? null)
      : (providerTimeoutMs ?? (getConfig().timeout?.defaultSeconds ?? 300) * 1000);
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new DOMException('Upstream request timed out', 'TimeoutError'));
    }, timeoutMs);
    timeoutId.unref?.();

    return {
      signal: signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal,
      isTimedOut: () => timeoutController.signal.aborted,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  private buildTimeoutError(): Error {
    const err = new Error('Upstream timeout') as any;
    err.routingContext = {
      statusCode: 504,
      code: 'upstream_timeout',
    };
    return err;
  }

  private buildCancelledError(signal: AbortSignal): Error {
    const isTimeout = signal.reason?.name === 'TimeoutError';
    const err = new Error(isTimeout ? 'Upstream timeout' : 'Client disconnected') as any;
    err.routingContext = {
      statusCode: isTimeout ? 504 : 499,
      code: isTimeout ? 'upstream_timeout' : 'client_disconnected',
    };
    return err;
  }

  /**
   * Determines if pass-through optimization should be used
   */
  private shouldUsePassThrough(
    request: UnifiedChatRequest,
    targetApiType: string,
    route: RouteResult
  ): boolean {
    // If vision fallthrough was applied, we must use the translated pathway
    // to ensure the modified messages (text instead of images) are sent.
    if ((request as any)._hasVisionFallthrough) {
      return false;
    }

    // pi-ai routes (OAuth + Claude-masking) require pi-ai Context format built by
    // the OAuth transformer's transformRequest. Pass-through would hand the raw
    // client body straight to pi-ai, and its transformMessages() would crash on
    // string-valued assistant content (issue #162).
    if (this.isPiAiRoute(route, targetApiType)) {
      return false;
    }

    // Codex CLI Responses API extensions (namespace tools, custom/freeform
    // tools) aren't understood by most Responses-API-compatible upstream
    // providers. Pass-through forwards the raw client body byte-for-byte and
    // returns the raw provider response byte-for-byte, so there's no point in
    // the pipeline to flatten namespace tools / normalize custom tool calls
    // on the way out or split/unwrap them on the way back. Force the full
    // transform pipeline (ResponsesTransformer.parseRequest/transformRequest/
    // transformResponse/formatResponse/formatStream) instead.
    if (
      getApiBaseType(targetApiType) === 'responses' &&
      hasCodexResponsesExtensions(request.originalBody)
    ) {
      return false;
    }

    const isCompatible =
      !!request.incomingApiType?.toLowerCase() &&
      request.incomingApiType?.toLowerCase() === targetApiType.toLowerCase();

    return isCompatible && !!request.originalBody;
  }

  /**
   * Transforms the request payload or uses pass-through optimization
   * @returns Transformed payload and bypass flag
   */
  private async transformRequestPayload(
    request: UnifiedChatRequest,
    route: RouteResult,
    transformer: any,
    targetApiType: string,
    adapters: ResolvedAdapter[] = []
  ): Promise<{ payload: any; bypassTransformation: boolean }> {
    let providerPayload: any;
    let bypassTransformation = false;

    if (this.shouldUsePassThrough(request, targetApiType, route)) {
      logger.debug(
        `Pass-through optimization active: ${request.incomingApiType} -> ${targetApiType}` +
          (adapters.length > 0 ? ` (with ${adapters.length} adapter(s))` : '')
      );
      providerPayload = JSON.parse(JSON.stringify(request.originalBody));
      providerPayload.model = route.model;

      // Add metadata from request
      if (request.metadata) {
        const apiMetadata = this.getApiMetadata(request.metadata);
        if (Object.keys(apiMetadata).length > 0) {
          providerPayload.metadata = apiMetadata;
        }
      }

      bypassTransformation = true;
    } else {
      // Inject OAuth provider into metadata so transformers can set provider/model
      // on assistant messages for thought-signature replay (required by Gemini 3).
      const oauthProvider = this.isClaudeMaskingApiKeyRoute(route, targetApiType)
        ? 'anthropic'
        : route.config.oauth_provider || route.provider;
      if (oauthProvider) {
        request = {
          ...request,
          metadata: {
            ...(request.metadata || {}),
            plexus_metadata: {
              ...((request.metadata as any)?.plexus_metadata || {}),
              oauthProvider,
            },
          },
        };
      }
      providerPayload = await transformer.transformRequest(request);
    }

    // Convert reasoning field to thinkingConfig for Gemini API
    providerPayload = this.applyGeminiThinkingConfig(route, targetApiType, providerPayload);

    providerPayload = this.applyRegistryAutoCompat(providerPayload, request, route, targetApiType);

    // Merge provider-level extraBody first
    if (route.config.extraBody) {
      providerPayload = { ...providerPayload, ...route.config.extraBody };
    }

    // Then merge model-level extraBody (overrides provider-level)
    if (route.modelConfig?.extraBody) {
      providerPayload = { ...providerPayload, ...route.modelConfig.extraBody };
    }

    // Apply alias-level advanced behaviors (e.g. strip_adaptive_thinking)
    // Also merge alias-level extraBody (overrides both provider and model level)
    if (route.canonicalModel) {
      const aliasConfig = getConfig().models?.[route.canonicalModel];
      if (aliasConfig?.extraBody) {
        providerPayload = { ...providerPayload, ...aliasConfig.extraBody };
      }
      if (aliasConfig?.advanced) {
        providerPayload = applyModelBehaviors(providerPayload, aliasConfig.advanced, {
          incomingApiType: request.incomingApiType ?? '',
          canonicalModel: route.canonicalModel,
        });
      }
    }

    // Apply provider/model adapters (preDispatch) in configured order
    for (const { adapter, options } of adapters) {
      providerPayload = adapter.preDispatch(providerPayload, options);
    }

    if (adapters.length > 0) {
      logger.debug(
        `Adapters applied (preDispatch): [${adapters.map((a) => a.adapter.name).join(', ')}] ` +
          `for ${route.provider}/${route.model}`
      );
    }

    return { payload: providerPayload, bypassTransformation };
  }

  private applyRegistryAutoCompat(
    providerPayload: any,
    request: UnifiedChatRequest,
    route: RouteResult,
    targetApiType: string
  ): any {
    return applyRegistryAutoCompat(providerPayload, request, route, targetApiType);
  }

  /**
   * Constructs the full provider request URL
   */
  private buildRequestUrl(
    route: RouteResult,
    transformer: any,
    request: UnifiedChatRequest,
    targetApiType: string
  ): string {
    const baseUrl = this.resolveBaseUrl(route, targetApiType);
    const endpoint = transformer.getEndpoint
      ? transformer.getEndpoint(request)
      : transformer.defaultEndpoint;
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Executes the HTTP POST request to the provider
   */
  private async executeProviderRequest(
    url: string,
    headers: Record<string, string>,
    payload: any,
    signal?: AbortSignal
  ): Promise<Response> {
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  }

  /**
   * Handles failed provider responses with cooldown logic
   */
  /**
   * Detects whether an error response body indicates a quota/funds exhaustion error.
   * These patterns should trigger a cooldown even on 400/403 responses.
   */
  private isQuotaExhaustedError(errorText: string): boolean {
    const lower = errorText.toLowerCase();
    return (
      lower.includes('insufficient fund') ||
      lower.includes('insufficient_quota') ||
      lower.includes('insufficient balance') ||
      lower.includes('insufficient_balance') ||
      lower.includes('quota exceeded') ||
      lower.includes('out of credits') ||
      lower.includes('credit balance is too low') ||
      lower.includes('credit_balance_too_low') ||
      lower.includes('account is out of credits') ||
      lower.includes('used up your points') ||
      lower.includes('usage limit') ||
      lower.includes('free plan') ||
      lower.includes('your credit balance') ||
      lower.includes('remaining quota') ||
      lower.includes('payment required') ||
      lower.includes('billing') ||
      lower.includes('no credits') ||
      lower.includes('topup') ||
      lower.includes('top up') ||
      lower.includes('top_up') ||
      lower.includes('rate limit') ||
      lower.includes('rate_limit')
    );
  }

  private async handleProviderError(
    response: Response,
    route: RouteResult,
    errorText: string,
    url?: string,
    headers?: Record<string, string>,
    targetApiType?: string,
    requestId?: string
  ): Promise<never> {
    logger.error(`Provider error: ${response.status} ${errorText}`);

    const cooldownManager = CooldownManager.getInstance();

    // 400s are ambiguous: they can be caller errors (bad prompt, invalid params) OR provider-side
    // quota/balance exhaustion. Only trigger cooldown for the latter.
    const isQuota400 =
      response.status === 400 &&
      QUOTA_ERROR_PATTERNS.some((p) => errorText.toLowerCase().includes(p.toLowerCase()));

    if (isQuota400) {
      logger.warn(
        `Detected quota/balance error in 400 response from ${route.provider}/${route.model}`
      );
    }

    // Trigger cooldown for all provider errors except:
    // - 413 (payload too large) and 422 (unprocessable entity): caller errors, not provider failures
    // - 400 without a quota pattern: likely a request validation error, not a provider failure
    const isCallerError =
      response.status === 413 ||
      response.status === 422 ||
      (response.status === 400 && !isQuota400);

    if (!isCallerError) {
      let cooldownDuration: number | undefined;

      // For 429 errors, try to parse provider-specific cooldown duration
      if (response.status === 429) {
        // Get provider type for parser lookup
        cooldownDuration = parseCooldownDurationForProvider(
          resolveCooldownProviderType(route),
          errorText,
          'HTTP'
        );
      }

      // Mark provider+model as failed with optional duration
      // For non-429 errors, cooldownDuration will be undefined and default (10 minutes) will be used
      cooldownManager.markProviderFailure(
        route.provider,
        route.model,
        cooldownDuration,
        this.formatFailureReason(
          { routingContext: { providerResponse: errorText, statusCode: response.status } },
          true
        )
      );
    }

    // Create enriched error with routing context
    const error = new Error(this.formatClientProviderError(response.status, errorText)) as any;
    error.routingContext = {
      provider: route.provider,
      targetModel: route.model,
      targetApiType: targetApiType,
      url: url,
      headers: sanitizeHeaders(headers || {}),
      statusCode: response.status,
      providerResponse: errorText,
      providerResponseHeaders: this.extractResponseHeaders(response),
      cooldownTriggered: !isCallerError,
    };

    // Capture the raw error response for debug logs
    if (requestId) {
      DebugManager.getInstance().addResponseMeta(
        requestId,
        response.status,
        this.extractResponseHeaders(response)
      );
      DebugManager.getInstance().addRawResponse(requestId, errorText);
    }

    throw error;
  }

  /**
   * Extract all provider response headers from a fetch Response
   */
  private extractResponseHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  /**
   * Enriches response with Plexus metadata
   */
  private enrichResponseWithMetadata(
    response: UnifiedChatResponse,
    route: RouteResult,
    targetApiType: string
  ): void {
    response.plexus = {
      provider: route.provider,
      model: route.model,
      apiType: targetApiType,
      pricing: route.modelConfig?.pricing,
      providerDiscount: route.config.discount,
      canonicalModel: route.canonicalModel,
      config: route.config,
    };
  }

  /**
   * Handles streaming responses
   */
  private handleStreamingResponse(
    response: Response,
    request: UnifiedChatRequest,
    route: RouteResult,
    targetApiType: string,
    bypassTransformation: boolean,
    adapters: ResolvedAdapter[] = []
  ): UnifiedChatResponse {
    logger.debug('Streaming response detected');

    // Capture response metadata for debug logging
    if (request.requestId) {
      DebugManager.getInstance().addResponseMeta(
        request.requestId,
        response.status,
        this.extractResponseHeaders(response)
      );
    }

    let rawStream: ReadableStream = response.body!;

    // If any adapter defines preDispatchStreamChunk, pipe the raw SSE stream
    // through a rewrite transform before it reaches transformStream().
    const streamAdapters = adapters.filter((a) => a.adapter.preDispatchStreamChunk);
    if (streamAdapters.length > 0) {
      rawStream = rawStream.pipeThrough(this.buildSseRewriteTransform(streamAdapters));
      logger.debug(
        `Stream adapters applied (preDispatchStreamChunk): [${streamAdapters.map((a) => a.adapter.name).join(', ')}] ` +
          `for ${route.provider}/${route.model}`
      );
    }

    const streamResponse: UnifiedChatResponse = {
      id: 'stream-' + Date.now(),
      model: request.model,
      content: null,
      stream: rawStream,
      bypassTransformation: bypassTransformation,
    };

    this.enrichResponseWithMetadata(streamResponse, route, targetApiType);

    return streamResponse;
  }

  /**
   * Builds a TransformStream that rewrites raw SSE lines through the
   * preDispatchStreamChunk hooks of the given adapters.
   * Handles chunked delivery — lines may arrive split across multiple chunks.
   */
  private buildSseRewriteTransform(
    adapters: ResolvedAdapter[]
  ): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    return new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) segment in the buffer
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          let rewritten = line;
          for (const { adapter, options } of adapters) {
            rewritten = adapter.preDispatchStreamChunk!(rewritten, options);
          }
          controller.enqueue(encoder.encode(rewritten + '\n'));
        }
      },
      flush(controller) {
        if (buffer.length > 0) {
          let rewritten = buffer;
          for (const { adapter, options } of adapters) {
            rewritten = adapter.preDispatchStreamChunk!(rewritten, options);
          }
          controller.enqueue(encoder.encode(rewritten));
        }
      },
    });
  }

  /**
   * Handles non-streaming responses
   */
  private async handleNonStreamingResponse(
    response: Response,
    request: UnifiedChatRequest,
    route: RouteResult,
    targetApiType: string,
    transformer: any,
    bypassTransformation: boolean,
    adapters: ResolvedAdapter[] = []
  ): Promise<UnifiedChatResponse> {
    // Capture response metadata for debug logging
    if (request.requestId) {
      DebugManager.getInstance().addResponseMeta(
        request.requestId,
        response.status,
        this.extractResponseHeaders(response)
      );
    }

    let responseBody = await this.parseJsonResponseBody(
      response,
      request.requestId,
      route,
      targetApiType
    );
    logger.silly('Upstream Response Payload', responseBody);

    // Apply provider/model adapters (postDispatch) in reverse order
    if (adapters.length > 0) {
      for (let i = adapters.length - 1; i >= 0; i--) {
        responseBody = adapters[i]!.adapter.postDispatch(responseBody, adapters[i]!.options);
      }
      logger.debug(
        `Adapters applied (postDispatch): [${[...adapters]
          .reverse()
          .map((a) => a.adapter.name)
          .join(', ')}] ` + `for ${route.provider}/${route.model}`
      );
    }

    if (request.requestId) {
      DebugManager.getInstance().addResponseMeta(
        request.requestId,
        response.status,
        this.extractResponseHeaders(response)
      );
      DebugManager.getInstance().addRawResponse(request.requestId, responseBody);
    }

    let unifiedResponse: UnifiedChatResponse;

    if (bypassTransformation) {
      // We still need unified response for usage stats, so we transform purely for that
      // But we set the bypass flag and attach raw response
      const syntheticResponse = await transformer.transformResponse(responseBody);
      unifiedResponse = {
        ...syntheticResponse,
        bypassTransformation: true,
        rawResponse: responseBody,
      };
    } else {
      unifiedResponse = await transformer.transformResponse(responseBody);
    }

    this.enrichResponseWithMetadata(unifiedResponse, route, targetApiType);

    return unifiedResponse;
  }

  async dispatchEmbeddings(request: any): Promise<any> {
    return this.getMediaDispatcher().dispatchEmbeddings(request);
  }

  async dispatchTranscription(
    request: UnifiedTranscriptionRequest
  ): Promise<UnifiedTranscriptionResponse> {
    return this.getMediaDispatcher().dispatchTranscription(request);
  }

  async dispatchSpeech(request: UnifiedSpeechRequest): Promise<UnifiedSpeechResponse> {
    return this.getMediaDispatcher().dispatchSpeech(request);
  }

  async dispatchImageGenerations(
    request: UnifiedImageGenerationRequest
  ): Promise<UnifiedImageGenerationResponse> {
    return this.getMediaDispatcher().dispatchImageGenerations(request);
  }

  async dispatchImageEdits(request: UnifiedImageEditRequest): Promise<UnifiedImageEditResponse> {
    return this.getMediaDispatcher().dispatchImageEdits(request);
  }
}
