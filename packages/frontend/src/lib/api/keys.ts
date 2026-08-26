export const API_BASE = '';

export const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  const adminKey = localStorage.getItem('plexus_admin_key');
  if (adminKey) headers.set('x-admin-key', adminKey);

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem('plexus_admin_key');
    if (window.location.pathname !== '/ui/login') window.location.href = '/ui/login';
  }
  return response;
};

interface KeyMetadata {
  readonly comment?: string;
  readonly quotas?: string[];
  readonly allowedModels?: string[];
  readonly allowedProviders?: string[];
  readonly excludedModels?: string[];
  readonly excludedProviders?: string[];
  readonly allowRawPassthrough?: boolean;
  readonly allowedIps?: string[];
  readonly expiresInMinutes?: number;
  readonly expiresAt?: number;
  readonly disabledAt?: number;
  readonly pausedAt?: number;
  readonly pauseSource?: string;
  readonly pauseReason?: string;
}

export interface KeyConfig extends KeyMetadata {
  readonly key: string;
  readonly fingerprint: string;
}

export interface EditableKeyConfig extends KeyMetadata {
  readonly key: string;
  readonly fingerprint?: string;
}

export interface OneTimeSecret {
  readonly name: string;
  readonly secret: string;
  readonly message: string;
}

interface KeyResponse extends KeyMetadata {
  readonly fingerprint?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')
    ? value
    : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const parseKeyResponse = (value: unknown): KeyResponse => {
  if (!isRecord(value)) return {};

  const quotas = readStringArray(value.quotas);
  const allowedModels = readStringArray(value.allowedModels);
  const allowedProviders = readStringArray(value.allowedProviders);
  const excludedModels = readStringArray(value.excludedModels);
  const excludedProviders = readStringArray(value.excludedProviders);
  const allowedIps = readStringArray(value.allowedIps);
  const expiresAt = readNumber(value.expiresAt);
  const disabledAt = readNumber(value.disabledAt);
  const pausedAt = readNumber(value.pausedAt);

  return {
    ...(typeof value.comment === 'string' ? { comment: value.comment } : {}),
    ...(quotas ? { quotas } : {}),
    ...(allowedModels ? { allowedModels } : {}),
    ...(allowedProviders ? { allowedProviders } : {}),
    ...(excludedModels ? { excludedModels } : {}),
    ...(excludedProviders ? { excludedProviders } : {}),
    ...(value.allowRawPassthrough === true ? { allowRawPassthrough: true } : {}),
    ...(allowedIps ? { allowedIps } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(disabledAt !== undefined ? { disabledAt } : {}),
    ...(pausedAt !== undefined ? { pausedAt } : {}),
    ...(typeof value.pauseSource === 'string' ? { pauseSource: value.pauseSource } : {}),
    ...(typeof value.pauseReason === 'string' ? { pauseReason: value.pauseReason } : {}),
    ...(typeof value.fingerprint === 'string' ? { fingerprint: value.fingerprint } : {}),
  };
};

const readError = async (response: Response, fallback: string): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body)) return fallback;
  const message = body.error;
  return typeof message === 'string'
    ? message.replace(/sk-[a-f0-9]{48}/gi, '[redacted]')
    : fallback;
};

const readOneTimeSecret = async (response: Response): Promise<OneTimeSecret> => {
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    typeof body.name !== 'string' ||
    typeof body.secret !== 'string' ||
    typeof body.message !== 'string'
  ) {
    throw new Error('The server returned an invalid one-time secret response');
  }
  return { name: body.name, secret: body.secret, message: body.message };
};

const metadataBody = (key: EditableKeyConfig, includeExpiry: boolean) => ({
  comment: key.comment,
  quotas: key.quotas ?? [],
  allowedModels: key.allowedModels ?? [],
  allowedProviders: key.allowedProviders ?? [],
  excludedModels: key.excludedModels ?? [],
  excludedProviders: key.excludedProviders ?? [],
  allowRawPassthrough: key.allowRawPassthrough === true,
  allowedIps: key.allowedIps ?? [],
  ...(includeExpiry && key.expiresInMinutes ? { expiresInMinutes: key.expiresInMinutes } : {}),
});

export const getKeys = async (): Promise<KeyConfig[]> => {
  try {
    const response = await fetchWithAuth(`${API_BASE}/v0/management/keys`);
    if (!response.ok) throw new Error('Failed to fetch keys');
    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error('The server returned an invalid key list');
    return Object.entries(payload).map(([key, rawValue]) => {
      const value = parseKeyResponse(rawValue);
      return {
        key,
        fingerprint: value.fingerprint ?? 'unavailable',
        comment: value.comment,
        quotas: value.quotas,
        allowedModels: value.allowedModels,
        allowedProviders: value.allowedProviders,
        excludedModels: value.excludedModels,
        excludedProviders: value.excludedProviders,
        allowRawPassthrough: value.allowRawPassthrough === true,
        allowedIps: value.allowedIps,
        expiresAt: value.expiresAt,
        disabledAt: value.disabledAt,
        pausedAt: value.pausedAt,
        pauseSource: value.pauseSource,
        pauseReason: value.pauseReason,
      };
    });
  } catch (error) {
    if (error instanceof Error) return [];
    throw error;
  }
};

export const createKey = async (key: EditableKeyConfig): Promise<OneTimeSecret> => {
  const response = await fetchWithAuth(`${API_BASE}/v0/management/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: key.key, ...metadataBody(key, true) }),
  });
  if (!response.ok) throw new Error(await readError(response, 'Failed to create key'));
  return readOneTimeSecret(response);
};

export const updateKey = async (key: EditableKeyConfig): Promise<void> => {
  const response = await fetchWithAuth(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(key.key)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadataBody(key, false)),
    }
  );
  if (!response.ok) throw new Error(await readError(response, 'Failed to update key'));
};

export const rotateKey = async (keyName: string): Promise<OneTimeSecret> => {
  const response = await fetchWithAuth(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/rotate`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error(await readError(response, 'Failed to rotate key'));
  return readOneTimeSecret(response);
};

export const deleteKey = async (keyName: string): Promise<void> => {
  const response = await fetchWithAuth(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error(await readError(response, 'Failed to delete key'));
};

export const disableKey = async (keyName: string): Promise<void> => {
  const response = await fetchWithAuth(
    `${API_BASE}/v0/management/keys/${encodeURIComponent(keyName)}/disable`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error(await readError(response, 'Failed to disable key'));
};
