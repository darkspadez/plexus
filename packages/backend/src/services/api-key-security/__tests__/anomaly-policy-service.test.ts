import { describe, expect, it } from 'vitest';
import type { GlobalAnomalyPolicy, PerKeyAnomalyPolicy } from '../policy-schema';
import {
  AnomalyPolicyService,
  DEFAULT_GLOBAL_ANOMALY_POLICY,
  type AnomalyPolicyConfigStore,
} from '../anomaly-policy-service';

function createStore(): AnomalyPolicyConfigStore {
  let globalPolicy: GlobalAnomalyPolicy = DEFAULT_GLOBAL_ANOMALY_POLICY;
  const policies: Record<string, PerKeyAnomalyPolicy> = {
    inherited: { mode: 'inherit' },
    disabled: { mode: 'disabled', reason: 'maintenance' },
    override: {
      mode: 'override',
      reason: 'integration traffic',
      policy: {
        ...DEFAULT_GLOBAL_ANOMALY_POLICY,
        lookbackMinutes: 720,
        minimumActiveMinutes: 120,
      },
    },
  };

  return {
    getGlobalAnomalyPolicy: async () => globalPolicy,
    saveGlobalAnomalyPolicy: async (policy) => {
      globalPolicy = policy;
    },
    getAllKeyAnomalyPolicies: async () => ({ ...policies }),
    getKeyAnomalyPolicy: async (name) => policies[name] ?? null,
    saveKeyAnomalyPolicy: async (name, policy) => {
      if (!Object.hasOwn(policies, name)) return false;
      policies[name] = policy;
      return true;
    },
    flush: async () => {},
  };
}

describe('AnomalyPolicyService', () => {
  it('preserves configured policies alongside effective previews', async () => {
    // Given
    const service = new AnomalyPolicyService(createStore());

    // When
    const snapshot = await service.getSnapshot();

    // Then
    expect(snapshot.keys.inherited).toEqual({
      configured: { mode: 'inherit' },
      effective: DEFAULT_GLOBAL_ANOMALY_POLICY,
    });
    expect(snapshot.keys.disabled).toEqual({
      configured: { mode: 'disabled', reason: 'maintenance' },
      effective: { ...DEFAULT_GLOBAL_ANOMALY_POLICY, mode: 'disabled' },
    });
    expect(snapshot.keys.override).toEqual({
      configured: {
        mode: 'override',
        reason: 'integration traffic',
        policy: {
          ...DEFAULT_GLOBAL_ANOMALY_POLICY,
          lookbackMinutes: 720,
          minimumActiveMinutes: 120,
        },
      },
      effective: {
        ...DEFAULT_GLOBAL_ANOMALY_POLICY,
        lookbackMinutes: 720,
        minimumActiveMinutes: 120,
      },
    });
  });

  it('replaces a valid global policy and flushes the config cache', async () => {
    // Given
    const store = createStore();
    let flushes = 0;
    const service = new AnomalyPolicyService({
      ...store,
      flush: async () => {
        flushes += 1;
        await store.flush();
      },
    });
    const policy = { mode: 'observe' };

    // When
    const saved = await service.replaceGlobalPolicy(policy);

    // Then
    expect(saved.mode).toBe('observe');
    expect(flushes).toBe(1);
    expect((await service.getSnapshot()).global.mode).toBe('observe');
  });

  it('rejects a partial override before changing the store', async () => {
    // Given
    const store = createStore();
    let saves = 0;
    const service = new AnomalyPolicyService({
      ...store,
      saveKeyAnomalyPolicy: async () => {
        saves += 1;
        return true;
      },
    });

    // When
    const result = service.setKeyPolicy('override', {
      mode: 'override',
      reason: 'missing threshold fields',
      policy: { minimumRequestsPerMinute: 75 },
    });

    // Then
    await expect(result).rejects.toThrow();
    expect(saves).toBe(0);
  });
});
