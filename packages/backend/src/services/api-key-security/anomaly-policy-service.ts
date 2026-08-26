import {
  DEFAULT_GLOBAL_ANOMALY_POLICY as schemaDefaultGlobalPolicy,
  GlobalAnomalyPolicySchema,
  PerKeyAnomalyPolicySchema,
  type GlobalAnomalyPolicy,
  type PerKeyAnomalyPolicy,
} from './policy-schema';

export const DEFAULT_GLOBAL_ANOMALY_POLICY = schemaDefaultGlobalPolicy;

export type AnomalyPolicyConfigStore = {
  readonly getGlobalAnomalyPolicy: () => Promise<GlobalAnomalyPolicy>;
  readonly saveGlobalAnomalyPolicy: (policy: GlobalAnomalyPolicy) => Promise<void>;
  readonly getAllKeyAnomalyPolicies: () => Promise<Record<string, PerKeyAnomalyPolicy>>;
  readonly getKeyAnomalyPolicy: (name: string) => Promise<PerKeyAnomalyPolicy | null>;
  readonly saveKeyAnomalyPolicy: (name: string, policy: PerKeyAnomalyPolicy) => Promise<boolean>;
  readonly flush: () => Promise<void>;
};

export type AnomalyPolicySnapshot = {
  readonly global: GlobalAnomalyPolicy;
  readonly keys: Record<string, KeyAnomalyPolicyPreview>;
};

export type KeyAnomalyPolicyPreview = {
  readonly configured: PerKeyAnomalyPolicy;
  readonly effective: GlobalAnomalyPolicy;
};

function assertNever(value: never): never {
  throw new Error(`Unexpected anomaly policy mode: ${JSON.stringify(value)}`);
}

export function resolveEffectiveAnomalyPolicy(
  globalPolicy: GlobalAnomalyPolicy,
  perKeyPolicy: PerKeyAnomalyPolicy
): GlobalAnomalyPolicy {
  switch (perKeyPolicy.mode) {
    case 'inherit':
      return globalPolicy;
    case 'disabled':
      return { ...globalPolicy, mode: 'disabled' };
    case 'override':
      return { ...perKeyPolicy.policy, mode: globalPolicy.mode };
    default:
      return assertNever(perKeyPolicy);
  }
}

export class AnomalyPolicyService {
  constructor(private readonly store: AnomalyPolicyConfigStore) {}

  async getSnapshot(): Promise<AnomalyPolicySnapshot> {
    const globalPolicy = await this.store.getGlobalAnomalyPolicy();
    const configuredPolicies = await this.store.getAllKeyAnomalyPolicies();
    const keys: Record<string, KeyAnomalyPolicyPreview> = {};

    for (const [name, configuredPolicy] of Object.entries(configuredPolicies)) {
      keys[name] = {
        configured: configuredPolicy,
        effective: resolveEffectiveAnomalyPolicy(globalPolicy, configuredPolicy),
      };
    }

    return { global: globalPolicy, keys };
  }

  async getKeyPolicy(name: string): Promise<KeyAnomalyPolicyPreview | null> {
    const configuredPolicy = await this.store.getKeyAnomalyPolicy(name);
    if (!configuredPolicy) return null;
    const globalPolicy = await this.store.getGlobalAnomalyPolicy();
    return {
      configured: configuredPolicy,
      effective: resolveEffectiveAnomalyPolicy(globalPolicy, configuredPolicy),
    };
  }

  async replaceGlobalPolicy(input: unknown): Promise<GlobalAnomalyPolicy> {
    const parsed = GlobalAnomalyPolicySchema.safeParse(input);
    if (!parsed.success) throw parsed.error;

    await this.store.saveGlobalAnomalyPolicy(parsed.data);
    await this.store.flush();
    return parsed.data;
  }

  async setKeyPolicy(name: string, input: unknown): Promise<KeyAnomalyPolicyPreview | null> {
    const parsed = PerKeyAnomalyPolicySchema.safeParse(input);
    if (!parsed.success) throw parsed.error;

    const saved = await this.store.saveKeyAnomalyPolicy(name, parsed.data);
    if (!saved) return null;

    await this.store.flush();
    const globalPolicy = await this.store.getGlobalAnomalyPolicy();
    return {
      configured: parsed.data,
      effective: resolveEffectiveAnomalyPolicy(globalPolicy, parsed.data),
    };
  }
}
