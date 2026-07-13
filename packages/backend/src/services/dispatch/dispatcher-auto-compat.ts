import type { UnifiedChatRequest } from '../../types/unified';
import { logger } from '../../utils/logger';
import type { RouteResult } from '../routing/router';
import { buildGenerationOptions, resolvePiAiModel } from '../pi-ai/registry';
import type { GenerationIntent } from '../pi-ai/generation';
import { normalizeVerbosity } from '../pi-ai/generation';
import type { ReasoningIntent, ReasoningVisibility } from '../pi-ai/reasoning';
import { normalizeEffort, normalizeVisibility } from '../pi-ai/reasoning';

function hasOwn(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Detects Codex CLI Responses API extensions (namespace tools, custom/freeform
 * tools, and their corresponding input items) that most Responses-API-compatible
 * upstream providers don't understand. When present, the raw body cannot be
 * forwarded as-is (pass-through) — it must go through ResponsesTransformer's
 * namespace-flattening/custom-tool-normalization so the upstream provider only
 * ever sees plain function tools.
 */
export function hasCodexResponsesExtensions(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  if (
    Array.isArray(body.tools) &&
    body.tools.some((t: any) => t?.type === 'namespace' || t?.type === 'custom')
  ) {
    return true;
  }

  if (
    Array.isArray(body.input) &&
    body.input.some(
      (item: any) =>
        item &&
        typeof item === 'object' &&
        (item.type === 'custom_tool_call' ||
          item.type === 'custom_tool_call_output' ||
          (item.type === 'additional_tools' &&
            Array.isArray(item.tools) &&
            item.tools.length > 0) ||
          (item.type === 'function_call' && typeof item.namespace === 'string'))
    )
  ) {
    return true;
  }

  return false;
}

function normalizeReasoningFromUnified(
  reasoning: UnifiedChatRequest['reasoning']
): ReasoningIntent {
  const effort = normalizeEffort(reasoning?.effort);
  const enabled = effort === 'off' ? false : reasoning?.enabled;
  const visibility = normalizeVisibility(reasoning?.summary);
  return {
    ...(effort && effort !== 'off' ? { effort } : {}),
    ...(reasoning?.max_tokens != null ? { budgetTokens: reasoning.max_tokens } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(visibility ? { visibility } : {}),
    ...(reasoning?.summary ? { summaryDetail: reasoning.summary } : {}),
    source: 'client',
  };
}

function extractReasoningIntent(payload: any, request: UnifiedChatRequest): ReasoningIntent {
  const source = payload && typeof payload === 'object' ? payload : {};
  const incomingApiType = request.incomingApiType?.toLowerCase();

  if (incomingApiType === 'messages' && source.thinking && typeof source.thinking === 'object') {
    const thinking = source.thinking;
    const type = typeof thinking.type === 'string' ? thinking.type.toLowerCase() : undefined;
    const display = thinking.display;
    return {
      ...(type === 'disabled' ? { enabled: false } : { enabled: true }),
      ...(type === 'adaptive' ? { adaptive: true } : {}),
      ...(typeof thinking.budget_tokens === 'number'
        ? { budgetTokens: thinking.budget_tokens }
        : {}),
      ...(normalizeVisibility(display) ? { visibility: normalizeVisibility(display) } : {}),
      source: 'client',
    };
  }

  const rawReasoning = source.reasoning ?? request.reasoning;
  if (rawReasoning && typeof rawReasoning === 'object') {
    const effort = normalizeEffort((rawReasoning as any).effort);
    const summaryDetail =
      typeof (rawReasoning as any).summary === 'string' ? (rawReasoning as any).summary : undefined;
    const visibility = normalizeVisibility(summaryDetail);
    return {
      ...(effort === 'off' ? {} : effort ? { effort } : {}),
      ...(effort === 'off' ? { enabled: false } : {}),
      ...(typeof (rawReasoning as any).max_tokens === 'number'
        ? { budgetTokens: (rawReasoning as any).max_tokens }
        : {}),
      ...((rawReasoning as any).enabled !== undefined
        ? { enabled: (rawReasoning as any).enabled === true }
        : {}),
      ...(visibility ? { visibility } : {}),
      ...(summaryDetail ? { summaryDetail } : {}),
      source: 'client',
    };
  }

  const chatEffort = normalizeEffort(source.reasoning_effort);
  if (chatEffort) {
    return chatEffort === 'off'
      ? { enabled: false, source: 'client' }
      : { effort: chatEffort, enabled: true, source: 'client' };
  }

  const thinkingConfig = source.generationConfig?.thinkingConfig;
  if (thinkingConfig && typeof thinkingConfig === 'object') {
    const effort = normalizeEffort(thinkingConfig.thinkingLevel);
    const visibility: ReasoningVisibility | undefined =
      thinkingConfig.includeThoughts === true ? 'summary' : undefined;
    return {
      ...(effort && effort !== 'off' ? { effort } : {}),
      ...(typeof thinkingConfig.thinkingBudget === 'number'
        ? { budgetTokens: thinkingConfig.thinkingBudget }
        : {}),
      ...(thinkingConfig.thinkingBudget === 0 ? { enabled: false } : { enabled: true }),
      ...(visibility ? { visibility } : {}),
      source: 'client',
    };
  }

  return normalizeReasoningFromUnified(request.reasoning);
}

function extractGenerationIntent(payload: any, request: UnifiedChatRequest): GenerationIntent {
  const source = payload && typeof payload === 'object' ? payload : {};
  const maxTokens =
    source.max_output_tokens ??
    source.max_tokens ??
    source.max_completion_tokens ??
    source.generationConfig?.maxOutputTokens ??
    request.max_tokens;
  const temperature =
    source.temperature ?? source.generationConfig?.temperature ?? request.temperature;
  const verbosity = normalizeVerbosity(source.text?.verbosity ?? request.text?.verbosity);
  const serviceTier = source.service_tier ?? request.originalBody?.service_tier;

  return {
    reasoning: extractReasoningIntent(source, request),
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(verbosity ? { verbosity } : {}),
    ...(typeof serviceTier === 'string' ? { serviceTier } : {}),
  };
}

function mappedThinkingValue(model: any, effort: string | undefined): string | undefined {
  if (!effort) return undefined;
  const mapped = model.thinkingLevelMap?.[effort];
  return typeof mapped === 'string' ? mapped : effort;
}

function mappedOffValue(model: any): string | undefined {
  const off = model.thinkingLevelMap?.off;
  return typeof off === 'string' ? off : undefined;
}

function shouldDropTemperature(intent: GenerationIntent, options: Record<string, any>): boolean {
  return intent.temperature != null && !hasOwn(options, 'temperature');
}

function projectOpenAiCompletionsAutoCompat(
  payload: Record<string, any>,
  model: any,
  intent: GenerationIntent,
  options: Record<string, any>
): Record<string, any> {
  const next = { ...payload };
  const compat = model.compat ?? {};

  if (options.maxTokens != null) {
    if (compat.maxTokensField === 'max_completion_tokens') {
      delete next.max_tokens;
      next.max_completion_tokens = options.maxTokens;
    } else {
      next.max_tokens = options.maxTokens;
    }
  }
  if (hasOwn(options, 'temperature')) next.temperature = options.temperature;
  else if (shouldDropTemperature(intent, options)) delete next.temperature;

  if (!model.reasoning) return next;

  const reasoningEffort =
    typeof options.reasoningEffort === 'string' ? options.reasoningEffort : undefined;
  const enabled = reasoningEffort != null;
  const explicitOff = options.reasoning === 'off' || intent.reasoning.enabled === false;
  if (!enabled && !explicitOff) return next;

  const mapped = mappedThinkingValue(model, reasoningEffort);
  const off = mappedOffValue(model);

  switch (compat.thinkingFormat) {
    case 'zai':
      next.thinking = enabled ? { type: 'enabled', clear_thinking: false } : { type: 'disabled' };
      if (enabled && compat.supportsReasoningEffort && mapped) next.reasoning_effort = mapped;
      break;
    case 'qwen':
      next.enable_thinking = enabled;
      break;
    case 'qwen-chat-template':
      next.chat_template_kwargs = {
        ...(next.chat_template_kwargs ?? {}),
        enable_thinking: enabled,
        preserve_thinking: true,
      };
      break;
    case 'chat-template':
      next.chat_template_kwargs = {
        ...(next.chat_template_kwargs ?? {}),
        ...resolveChatTemplateKwargs(model, options),
      };
      break;
    case 'deepseek':
      next.thinking = enabled ? { type: 'enabled' } : { type: 'disabled' };
      if (enabled && compat.supportsReasoningEffort && mapped) next.reasoning_effort = mapped;
      break;
    case 'openrouter':
      next.reasoning = enabled ? { effort: mapped } : { effort: off ?? 'none' };
      break;
    case 'ant-ling':
      if (enabled && mapped) next.reasoning = { effort: mapped };
      break;
    case 'together':
      next.reasoning = { enabled };
      if (enabled && compat.supportsReasoningEffort && mapped) next.reasoning_effort = mapped;
      break;
    case 'string-thinking':
      next.thinking = enabled ? mapped : (off ?? 'none');
      break;
    default:
      if (enabled && compat.supportsReasoningEffort && mapped) {
        next.reasoning_effort = mapped;
      } else if (!enabled && compat.supportsReasoningEffort && off) {
        next.reasoning_effort = off;
      }
      break;
  }

  return next;
}

function resolveChatTemplateKwargs(model: any, options: Record<string, any>): Record<string, any> {
  const kwargs: Record<string, any> = {};
  const template = model.compat?.chatTemplateKwargs;
  if (!template || typeof template !== 'object') return kwargs;

  for (const [key, value] of Object.entries(template)) {
    const resolved = resolveChatTemplateKwargValue(model, options, value);
    if (resolved !== undefined) kwargs[key] = resolved;
  }
  return kwargs;
}

function resolveChatTemplateKwargValue(model: any, options: Record<string, any>, value: unknown) {
  if (typeof value !== 'object' || value === null) return value;
  const config = value as { $var?: string; omitWhenOff?: boolean };
  const reasoningEffort =
    typeof options.reasoningEffort === 'string' ? options.reasoningEffort : undefined;
  if (!reasoningEffort && config.omitWhenOff) return undefined;
  if (config.$var === 'thinking.enabled') return !!reasoningEffort;
  const mapped = reasoningEffort
    ? model.thinkingLevelMap?.[reasoningEffort]
    : model.thinkingLevelMap?.off;
  return mapped === undefined ? reasoningEffort : typeof mapped === 'string' ? mapped : undefined;
}

function projectResponsesAutoCompat(
  payload: Record<string, any>,
  model: any,
  intent: GenerationIntent,
  options: Record<string, any>
): Record<string, any> {
  const next = { ...payload };
  if (options.maxTokens != null) next.max_output_tokens = options.maxTokens;
  if (hasOwn(options, 'temperature')) next.temperature = options.temperature;
  else if (shouldDropTemperature(intent, options)) delete next.temperature;
  if (options.serviceTier !== undefined) next.service_tier = options.serviceTier;
  if (options.textVerbosity !== undefined) {
    next.text = { ...(next.text ?? {}), verbosity: options.textVerbosity };
  }
  if (options.reasoningEffort || options.reasoningSummary) {
    next.reasoning = {
      ...(next.reasoning ?? {}),
      effort: mappedThinkingValue(model, options.reasoningEffort) ?? 'medium',
      summary: options.reasoningSummary ?? next.reasoning?.summary ?? 'auto',
    };
    next.include = Array.from(
      new Set([...(Array.isArray(next.include) ? next.include : []), 'reasoning.encrypted_content'])
    );
  } else if (options.reasoning === 'off') {
    next.reasoning = { ...(next.reasoning ?? {}), effort: mappedOffValue(model) ?? 'none' };
  }
  return next;
}

function projectAnthropicAutoCompat(
  payload: Record<string, any>,
  model: any,
  intent: GenerationIntent,
  options: Record<string, any>
): Record<string, any> {
  const next = { ...payload };
  if (options.maxTokens != null) next.max_tokens = options.maxTokens;
  if (hasOwn(options, 'temperature')) next.temperature = options.temperature;
  else if (shouldDropTemperature(intent, options)) delete next.temperature;

  if (options.thinkingEnabled === true) {
    const display = options.thinkingDisplay ?? 'summarized';
    if (model.compat?.forceAdaptiveThinking === true) {
      next.thinking = { type: 'adaptive', display };
      if (options.effort) {
        next.output_config = { ...(next.output_config ?? {}), effort: options.effort };
      }
    } else {
      next.thinking = {
        type: 'enabled',
        budget_tokens: options.thinkingBudgetTokens ?? 1024,
        display,
      };
    }
  } else if (options.thinkingEnabled === false) {
    next.thinking = { type: 'disabled' };
  }

  return next;
}

function projectGeminiAutoCompat(
  payload: Record<string, any>,
  intent: GenerationIntent,
  options: Record<string, any>
): Record<string, any> {
  const next = { ...payload, generationConfig: { ...(payload.generationConfig ?? {}) } };
  if (options.maxTokens != null) next.generationConfig.maxOutputTokens = options.maxTokens;
  if (hasOwn(options, 'temperature')) next.generationConfig.temperature = options.temperature;
  else if (shouldDropTemperature(intent, options)) delete next.generationConfig.temperature;

  if (options.thinking?.enabled === true) {
    next.generationConfig.thinkingConfig = {
      includeThoughts: options.thinking.includeThoughts !== false,
      ...(options.thinking.level !== undefined ? { thinkingLevel: options.thinking.level } : {}),
      ...(options.thinking.budgetTokens !== undefined
        ? { thinkingBudget: options.thinking.budgetTokens }
        : {}),
    };
  } else if (options.thinking?.enabled === false) {
    next.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  return next;
}

export function applyRegistryAutoCompat(
  providerPayload: any,
  request: UnifiedChatRequest,
  route: RouteResult,
  targetApiType: string
): any {
  const autoCompat = route.config.auto_compat === true || route.modelConfig?.auto_compat === true;
  if (!autoCompat) return providerPayload;

  const piAiProvider = route.config.pi_ai_provider;
  const piAiModelId = route.modelConfig?.pi_ai_model_id;
  if (!piAiProvider || !piAiModelId) return providerPayload;

  const piAiModel = resolvePiAiModel(piAiProvider, piAiModelId);
  if (!piAiModel) {
    logger.debug(
      `Registry auto-compat skipped: ${route.provider}/${route.model} references unresolved ` +
        `pi-ai model ${piAiProvider}/${piAiModelId}`
    );
    return providerPayload;
  }

  const intent = extractGenerationIntent(providerPayload, request);
  const options = buildGenerationOptions(piAiModel, intent);

  const api = (piAiModel.api as string | undefined) ?? targetApiType;
  let nextPayload: any;
  if (
    api === 'openai-responses' ||
    api === 'openai-codex-responses' ||
    api === 'azure-openai-responses'
  ) {
    nextPayload = projectResponsesAutoCompat(providerPayload, piAiModel, intent, options);
  } else if (api === 'anthropic-messages') {
    nextPayload = projectAnthropicAutoCompat(providerPayload, piAiModel, intent, options);
  } else if (api === 'google-generative-ai' || api === 'google-generative-ai-vertex') {
    nextPayload = projectGeminiAutoCompat(providerPayload, intent, options);
  } else {
    nextPayload = projectOpenAiCompletionsAutoCompat(providerPayload, piAiModel, intent, options);
  }

  logger.debug(`Registry auto-compat applied for ${route.provider}/${route.model}`, {
    piAiProvider,
    piAiModelId,
    api,
    optionKeys: Object.keys(options),
  });

  return nextPayload;
}
