import { describe, expect, it } from 'vitest';
import {
  API_KEY_PAUSE_OUTCOMES,
  ApiKeyPauseValidationError,
  validateAdminResumeInput,
} from '../api-key-pause-service';

describe('API key pause service contract', () => {
  it('keeps the public outcomes in their documented order', () => {
    // Given
    const expected = ['paused', 'already_paused', 'resumed', 'not_paused', 'not_found', 'disabled'];

    // When
    const outcomes = API_KEY_PAUSE_OUTCOMES;

    // Then
    expect(outcomes).toEqual(expected);
  });

  it('rejects an empty admin actor before touching the database', () => {
    // Given
    const validate = (): void => {
      validateAdminResumeInput('  ', 'incident review');
    };

    // When / Then
    expect(validate).toThrow(ApiKeyPauseValidationError);
  });

  it('rejects an empty resume reason before touching the database', () => {
    // Given
    const validate = (): void => {
      validateAdminResumeInput('admin-1', '  ');
    };

    // When / Then
    expect(validate).toThrow(ApiKeyPauseValidationError);
  });
});
