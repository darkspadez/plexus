import { and, eq, gte, gt, isNull, lt, or } from 'drizzle-orm';
import { getCurrentDialect, getDatabase, getSchema } from '../../db/client';
import { encodeEvidence } from './pause-db-helpers';
import type { ApiKeyPauseEvidence, ApiKeyPauseResult } from './pause-contract';
import { ApiKeyPauseService } from './api-key-pause-service';
import {
  DEFAULT_GLOBAL_ANOMALY_POLICY,
  GlobalAnomalyPolicySchema,
  PerKeyAnomalyPolicySchema,
  type GlobalAnomalyPolicy,
  type PerKeyAnomalyPolicy,
} from './policy-schema';
import type { AnomalyEvaluationStore, EligibleAnomalyKey } from './anomaly-evaluation-scheduler';
import type { MinuteBucket } from './anomaly-detector';

const GLOBAL_POLICY_SETTING = 'apiKeySecurity.globalAnomalyPolicy';

function parseStoredJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as unknown;
}

export class DatabaseAnomalyEvaluationStore implements AnomalyEvaluationStore {
  constructor(
    clock?: () => number,
    private readonly pauseService = new ApiKeyPauseService({ clock })
  ) {}

  async getGlobalPolicy(): Promise<GlobalAnomalyPolicy> {
    const schema = getSchema();
    const rows = await getDatabase()
      .select({ value: schema.systemSettings.value })
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, GLOBAL_POLICY_SETTING))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return DEFAULT_GLOBAL_ANOMALY_POLICY;
    const stored = parseStoredJson(row.value);
    const value =
      typeof stored === 'object' && stored !== null && 'value' in stored ? stored.value : stored;
    return GlobalAnomalyPolicySchema.parse(value);
  }

  async listEligibleKeys(now: number): Promise<readonly EligibleAnomalyKey[]> {
    const schema = getSchema();
    const rows = await getDatabase()
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        policy: schema.apiKeys.anomalyPolicy,
      })
      .from(schema.apiKeys)
      .where(
        and(
          isNull(schema.apiKeys.pausedAt),
          isNull(schema.apiKeys.disabledAt),
          or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, now))
        )
      );
    return rows.map(
      (row: { readonly id: number; readonly name: string; readonly policy: unknown }) => ({
        id: row.id,
        name: row.name,
        policy: PerKeyAnomalyPolicySchema.parse(parseStoredJson(row.policy) ?? { mode: 'inherit' }),
      })
    );
  }

  async listKeyPolicies(): Promise<readonly PerKeyAnomalyPolicy[]> {
    const schema = getSchema();
    const rows = await getDatabase()
      .select({ policy: schema.apiKeys.anomalyPolicy })
      .from(schema.apiKeys);
    return rows.map((row: { readonly policy: unknown }) =>
      PerKeyAnomalyPolicySchema.parse(parseStoredJson(row.policy) ?? { mode: 'inherit' })
    );
  }

  async loadBuckets(
    keyId: number,
    startMs: number,
    endMs: number
  ): Promise<readonly MinuteBucket[]> {
    const schema = getSchema();
    return getDatabase()
      .select({
        bucketStartMs: schema.apiKeyRequestBuckets.bucketStartMs,
        count: schema.apiKeyRequestBuckets.count,
      })
      .from(schema.apiKeyRequestBuckets)
      .where(
        and(
          eq(schema.apiKeyRequestBuckets.apiKeyId, keyId),
          gte(schema.apiKeyRequestBuckets.bucketStartMs, startMs),
          lt(schema.apiKeyRequestBuckets.bucketStartMs, endMs)
        )
      );
  }

  async recordWouldPauseOnce(
    key: EligibleAnomalyKey,
    evidence: ApiKeyPauseEvidence & { readonly evaluationEndMs: number }
  ): Promise<void> {
    const schema = getSchema();
    const db = getDatabase();
    await db
      .insert(schema.apiKeySecurityEvents)
      .values({
        apiKeyId: key.id,
        keyName: key.name,
        eventKind: 'would_pause',
        source: 'automatic',
        actor: null,
        reason: 'sustained anomaly observed',
        evidence: encodeEvidence(evidence, getCurrentDialect()),
        evaluationWindowEndMs: evidence.evaluationEndMs,
        createdAt: evidence.evaluationEndMs,
      })
      .onConflictDoNothing({
        target: [
          schema.apiKeySecurityEvents.apiKeyId,
          schema.apiKeySecurityEvents.eventKind,
          schema.apiKeySecurityEvents.evaluationWindowEndMs,
        ],
      });
  }

  async pauseAutomatically(
    key: EligibleAnomalyKey,
    evidence: ApiKeyPauseEvidence
  ): Promise<ApiKeyPauseResult> {
    return this.pauseService.recordAutomaticPause(key.name, evidence, 'sustained anomaly detected');
  }

  async deleteBucketsBefore(cutoffMs: number): Promise<void> {
    const schema = getSchema();
    await getDatabase()
      .delete(schema.apiKeyRequestBuckets)
      .where(lt(schema.apiKeyRequestBuckets.bucketStartMs, cutoffMs));
  }
}
