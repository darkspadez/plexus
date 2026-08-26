export const API_KEY_PAUSE_OUTCOMES = [
  'paused',
  'already_paused',
  'resumed',
  'not_paused',
  'not_found',
  'disabled',
] as const;

export type ApiKeyPauseOutcome = (typeof API_KEY_PAUSE_OUTCOMES)[number];
export type ApiKeyPauseResult = 'paused' | 'already_paused' | 'disabled' | 'not_found';
export type ApiKeyResumeResult = 'resumed' | 'not_paused' | 'disabled' | 'not_found';

export const API_KEY_PAUSE_SOURCES = ['manual', 'automatic'] as const;
export type ApiKeyPauseSource = (typeof API_KEY_PAUSE_SOURCES)[number];

export type ApiKeyPauseEvidence = Readonly<Record<string, unknown>>;

export type ApiKeySecurityEvent = {
  readonly id: number;
  readonly apiKeyId: number | null;
  readonly keyName: string;
  readonly eventKind: 'manual_pause' | 'auto_pause' | 'resume' | 'key_deleted' | string;
  readonly source: string;
  readonly actor: string | null;
  readonly reason: string | null;
  readonly evidence: ApiKeyPauseEvidence | null;
  readonly createdAt: number;
};

export class ApiKeyPauseValidationError extends Error {
  override readonly name = 'ApiKeyPauseValidationError';

  constructor(readonly field: 'actor' | 'reason') {
    super(`Resume ${field} must not be empty`);
  }
}

export function validateAdminResumeInput(
  actor: string,
  reason: string
): { readonly actor: string; readonly reason: string } {
  const normalizedActor = actor.trim();
  if (normalizedActor.length === 0) {
    throw new ApiKeyPauseValidationError('actor');
  }

  const normalizedReason = reason.trim();
  if (normalizedReason.length === 0) {
    throw new ApiKeyPauseValidationError('reason');
  }

  return { actor: normalizedActor, reason: normalizedReason };
}
