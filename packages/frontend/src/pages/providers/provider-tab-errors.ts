/**
 * provider-tab-errors.ts — pure save-blocking validation, aggregated per tab.
 *
 * The tabbed provider drawer surfaces errors as a danger dot on the owning
 * tab's label; clicking Save with errors jumps to the first offending tab.
 * toProviderPayload() remains the final gate — this module only decides which
 * tab owns each pre-flight error so the UX can navigate to it.
 */
import type { Provider } from '../../lib/api';

export type ProviderFormTab = 'connection' | 'limits' | 'transformations' | 'models';

export const PROVIDER_FORM_TABS: { value: ProviderFormTab; label: string }[] = [
  { value: 'connection', label: 'Connection' },
  { value: 'limits', label: 'Limits & Quota' },
  { value: 'transformations', label: 'Transformations' },
  { value: 'models', label: 'Models' },
];

export type ProviderTabErrors = Record<ProviderFormTab, string | null>;

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeProviderTabErrors(args: {
  id: string | undefined;
  isOAuthMode: boolean;
  oauthAccount: string | undefined;
  quotaValidationError: string | null;
  rawPassthrough: Provider['rawPassthrough'];
}): ProviderTabErrors {
  const connection = !args.id?.trim()
    ? 'Provider ID is required'
    : args.isOAuthMode && !args.oauthAccount?.trim()
      ? 'OAuth account is required'
      : null;

  let transformations: string | null = null;
  if (args.rawPassthrough?.enabled) {
    if (args.isOAuthMode) {
      transformations = 'Raw passthrough currently supports static API-key providers only';
    } else if (!isValidHttpUrl(args.rawPassthrough.baseUrl ?? '')) {
      transformations = 'Raw passthrough requires a valid HTTP(S) base URL';
    }
  }

  return {
    connection,
    limits: args.quotaValidationError,
    transformations,
    models: null,
  };
}

export function firstErrorTab(errors: ProviderTabErrors): ProviderFormTab | null {
  for (const tab of PROVIDER_FORM_TABS) {
    if (errors[tab.value]) return tab.value;
  }
  return null;
}
