import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getCurrentDialect, getDatabase, getSchema } from '../../db/client';
import {
  decodeEvidence,
  encodeEvidence,
  type ApiKeySecurityEventRow,
  type PauseTransactionExecutor,
} from './pause-db-helpers';
import {
  API_KEY_PAUSE_OUTCOMES,
  ApiKeyPauseValidationError,
  validateAdminResumeInput,
  type ApiKeyPauseEvidence,
  type ApiKeyPauseResult,
  type ApiKeyPauseSource,
  type ApiKeyResumeResult,
  type ApiKeySecurityEvent,
} from './pause-contract';
import {
  runPauseTransition,
  runResumeTransition,
  type PauseDatabaseContext,
  type PauseTransition,
} from './pause-transitions';

export { API_KEY_PAUSE_OUTCOMES, ApiKeyPauseValidationError, validateAdminResumeInput };
export type {
  ApiKeyPauseEvidence,
  ApiKeyPauseOutcome,
  ApiKeyPauseResult,
  ApiKeyPauseSource,
  ApiKeyResumeResult,
  ApiKeySecurityEvent,
} from './pause-contract';

type PauseServiceOptions = {
  readonly clock?: () => number;
};

const pauseTails = new Map<string, Promise<void>>();

async function serializePause<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const previous = pauseTails.get(name) ?? Promise.resolve();
  let release = (): void => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pauseTails.set(name, current);

  try {
    await previous;
    return await operation();
  } finally {
    release();
    if (pauseTails.get(name) === current) pauseTails.delete(name);
  }
}

export class ApiKeyPauseService {
  private readonly clock: () => number;

  constructor(options: PauseServiceOptions = {}) {
    this.clock = options.clock ?? Date.now;
  }

  private context(): PauseDatabaseContext {
    return {
      db: getDatabase(),
      schema: getSchema(),
      dialect: getCurrentDialect(),
      timestamp: this.clock(),
    };
  }

  async pauseKey(
    name: string,
    source: ApiKeyPauseSource,
    reason: string,
    actor?: string
  ): Promise<ApiKeyPauseResult> {
    const request: PauseTransition = {
      name,
      source,
      reason,
      actor: actor ?? null,
      evidence: null,
    };
    return serializePause(name, () => runPauseTransition(this.context(), request));
  }

  async recordAutomaticPause(
    name: string,
    evidence: ApiKeyPauseEvidence,
    reason: string
  ): Promise<ApiKeyPauseResult> {
    const request: PauseTransition = {
      name,
      source: 'automatic',
      reason,
      actor: null,
      evidence,
    };
    return serializePause(name, () => runPauseTransition(this.context(), request));
  }

  async resumeKey(name: string, actor: string, reason: string): Promise<ApiKeyResumeResult> {
    const input = validateAdminResumeInput(actor, reason);
    return runResumeTransition(this.context(), {
      name,
      actor: input.actor,
      reason: input.reason,
    });
  }

  /**
   * Compatibility audit helper: writes history only and never changes the key.
   * Production deletion must use deleteKey() to atomically claim, snapshot, and remove the key.
   */
  async recordDeletionSnapshot(name: string, actor?: string, reason?: string): Promise<boolean> {
    const db = getDatabase();
    const schema = getSchema();
    const dialect = getCurrentDialect();
    const timestamp = this.clock();

    return db.transaction(async (tx: PauseTransactionExecutor) => {
      const rows = await tx
        .select<{ readonly id: number }>({ id: schema.apiKeys.id })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.name, name))
        .limit(1);
      const key = rows[0];
      if (key === undefined) return false;

      const evidence = { deletedKeyId: key.id } satisfies ApiKeyPauseEvidence;
      await tx.insert(schema.apiKeySecurityEvents).values({
        apiKeyId: key.id,
        keyName: name,
        eventKind: 'key_deleted',
        source: actor === undefined ? 'system' : 'admin',
        actor: actor ?? null,
        reason: reason ?? null,
        evidence: encodeEvidence(evidence, dialect),
        createdAt: timestamp,
      });
      return true;
    });
  }

  async deleteKey(name: string, actor?: string, reason?: string): Promise<boolean> {
    const db = getDatabase();
    const schema = getSchema();
    const dialect = getCurrentDialect();
    const timestamp = this.clock();

    return db.transaction(async (tx: PauseTransactionExecutor) => {
      const rows = await tx
        .update(schema.apiKeys)
        .set({ name: `__deleting__${randomUUID()}`, updatedAt: timestamp })
        .where(eq(schema.apiKeys.name, name))
        .returning({ id: schema.apiKeys.id });
      const key = rows[0];
      if (key === undefined) return false;

      const evidence = { deletedKeyId: key.id } satisfies ApiKeyPauseEvidence;
      await tx.insert(schema.apiKeySecurityEvents).values({
        apiKeyId: key.id,
        keyName: name,
        eventKind: 'key_deleted',
        source: actor === undefined ? 'system' : 'admin',
        actor: actor ?? null,
        reason: reason ?? null,
        evidence: encodeEvidence(evidence, dialect),
        createdAt: timestamp,
      });
      await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.id, key.id));
      return true;
    });
  }

  async getEvents(name: string, limit = 50, offset = 0): Promise<readonly ApiKeySecurityEvent[]> {
    const { db, schema } = this.context();
    const boundedLimit = Math.max(0, Math.floor(limit));
    const boundedOffset = Math.max(0, Math.floor(offset));
    const rows: readonly ApiKeySecurityEventRow[] = await db
      .select<ApiKeySecurityEventRow>()
      .from(schema.apiKeySecurityEvents)
      .where(eq(schema.apiKeySecurityEvents.keyName, name))
      .orderBy(desc(schema.apiKeySecurityEvents.createdAt), desc(schema.apiKeySecurityEvents.id))
      .limit(boundedLimit)
      .offset(boundedOffset);

    return rows.map((row) => ({
      id: row.id,
      apiKeyId: row.apiKeyId,
      keyName: row.keyName,
      eventKind: row.eventKind,
      source: row.source,
      actor: row.actor,
      reason: row.reason,
      evidence: decodeEvidence(row.evidence),
      createdAt: row.createdAt,
    }));
  }
}
