// Cooldown time formatting utilities
export {
  formatMinutesToMinSec,
  formatMsToMinSec,
  INDEFINITE_COOLDOWN_MS,
  INDEFINITE_COOLDOWN_THRESHOLD_MS,
} from './format-time';

// Quota ranking (most-constrained selection) shared by backend and frontend
export { constrainedRatio, mostConstrained, sortMostConstrainedFirst } from './quota-ranking';
export type { QuotaRatioFields } from './quota-ranking';

export {
  isOAuthPlaceholderUrl,
  isBodyCacheKeyInjectionField,
  getDefaultCacheKeyInjection,
  PROVIDER_CACHE_KEY_INJECTION_OPTIONS,
  PROVIDER_CACHE_KEY_INJECTION_VALUES,
  ProviderCacheKeyInjectionSchema,
  getDefaultResponsesExtensions,
  RESPONSES_EXTENSIONS,
  RESPONSES_LITE_EXTENSIONS,
  RESPONSES_EXTENSION_OPTIONS,
  ResponsesExtensionSchema,
} from './provider';
export type {
  ProviderCacheKeyInjection,
  ProviderCacheKeyInjectionOption,
  ResponsesExtension,
  ResponsesExtensionOption,
} from './provider';

export {
  ProviderPresetSchema,
  PiAiQuirksSchema,
  applyProviderPreset,
  findProviderPreset,
  findUnresolvedPresetVars,
  substitutePresetVars,
} from './provider-presets';
export type {
  PiAiQuirks,
  ProviderPreset,
  ProviderPresetDraft,
  ProviderPresetTemplateVar,
} from './provider-presets';

export {
  LocalHttpMcpServerConfigSchema,
  McpKeyCreateSchema,
  McpKeySchema,
  McpServerConfigSchema,
  McpServerSettingsSchema,
  RemoteHttpMcpServerConfigSchema,
} from './mcp';
export type { McpKey, McpKeyCreate, McpServerConfig } from './mcp';

export {
  CssColorSchema,
  CssLengthRemSchema,
  CUSTOM_THEME_ID_RE,
  CustomThemeDefSchema,
  MAX_CUSTOM_THEMES,
  THEME_CONTENT_COLOR_KEYS,
  THEME_ID_RE,
  THEME_REQUIRED_COLOR_KEYS,
  ThemeDefSchema,
  UI_THEMES_SETTING_KEY,
  UiThemesLibrarySchema,
} from './themes';
export type { CustomThemeDef, ThemeColorKey, ThemeDef, UiThemesLibrary } from './themes';
