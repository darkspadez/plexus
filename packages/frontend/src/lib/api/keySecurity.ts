import { API_BASE, fetchWithAuth } from './keys';

export type AnomalyMode = 'disabled' | 'observe' | 'enforce';

export interface AnomalyThresholdPolicy {
  readonly lookbackMinutes: number;
  readonly exclusionGapMinutes: number;
  readonly windowMinutes: number;
  readonly sustainedWindows: number;
  readonly minimumRequestsPerMinute: number;
  readonly baselineMultiplier: number;
  readonly minimumBaselineRequests: number;
  readonly minimumActiveMinutes: number;
}

export interface GlobalAnomalyPolicy extends AnomalyThresholdPolicy {
  readonly mode: AnomalyMode;
}

export type PerKeyAnomalyPolicy =
  | { readonly mode: 'inherit' }
  | { readonly mode: 'disabled'; readonly reason: string }
  | {
      readonly mode: 'override';
      readonly reason: string;
      readonly policy: AnomalyThresholdPolicy;
    };

export interface KeyPolicyPreview {
  readonly configured: PerKeyAnomalyPolicy;
  readonly effective: GlobalAnomalyPolicy;
}

export interface AnomalyPolicySnapshot {
  readonly global: GlobalAnomalyPolicy;
  readonly keys: Readonly<Record<string, KeyPolicyPreview>>;
}

export interface KeySecurityEvent {
  readonly id: number;
  readonly keyName: string;
  readonly eventKind: string;
  readonly source: string;
  readonly actor: string | null;
  readonly reason: string | null;
  readonly evidence: Readonly<Record<string, unknown>> | null;
  readonly createdAt: number;
}

export interface KeyEventsPage {
  readonly events: readonly KeySecurityEvent[];
}

export type KeyTransitionResult =
  | 'paused'
  | 'already_paused'
  | 'resumed'
  | 'not_paused'
  | 'disabled'
  | 'not_found';

export interface KeyTransitionResponse {
  readonly result: KeyTransitionResult;
  readonly key: { readonly fingerprint: string; readonly pausedAt?: number };
}

const readError = async (response: Response, fallback: string): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;
  const error = 'error' in body ? body.error : undefined;
  const details = 'details' in body ? body.details : undefined;
  if (Array.isArray(details)) {
    const first = details[0];
    if (
      first &&
      typeof first === 'object' &&
      'message' in first &&
      typeof first.message === 'string'
    ) {
      return `${typeof error === 'string' ? error : fallback}: ${first.message}`;
    }
  }
  return typeof error === 'string' ? error : fallback;
};

const requestJson = async <T>(
  url: string,
  fallback: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetchWithAuth(url, options);
  if (!response.ok) throw new Error(await readError(response, fallback));
  return (await response.json()) as T;
};

const jsonWrite = (method: 'PATCH' | 'POST', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getAnomalyPolicySnapshot = (): Promise<AnomalyPolicySnapshot> =>
  requestJson(`${API_BASE}/v0/management/security/anomaly-policy`, 'Failed to load anomaly policy');

export const saveGlobalAnomalyPolicy = (
  policy: GlobalAnomalyPolicy
): Promise<GlobalAnomalyPolicy> =>
  requestJson(
    `${API_BASE}/v0/management/security/anomaly-policy`,
    'Failed to save anomaly policy',
    jsonWrite('PATCH', policy)
  );

export const getKeyAnomalyPolicy = (keyName: string): Promise<KeyPolicyPreview> =>
  requestJson(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/anomaly-policy`,
    'Failed to load key anomaly policy'
  );

export const saveKeyAnomalyPolicy = (
  keyName: string,
  policy: PerKeyAnomalyPolicy
): Promise<KeyPolicyPreview> =>
  requestJson(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/anomaly-policy`,
    'Failed to save key anomaly policy',
    jsonWrite('PATCH', policy)
  );

export const transitionKey = async (
  keyName: string,
  action: 'pause' | 'resume',
  reason: string
): Promise<KeyTransitionResponse> =>
  requestJson(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/${action}`,
    `Failed to ${action} key`,
    jsonWrite('POST', { reason })
  );

export const getKeySecurityEvents = (
  keyName: string,
  limit: number,
  offset: number
): Promise<KeyEventsPage> =>
  requestJson(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/security-events?limit=${limit}&offset=${offset}`,
    'Failed to load key security history'
  );
