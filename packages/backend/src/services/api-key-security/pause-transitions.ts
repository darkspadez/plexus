import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { getCurrentDialect, getSchema } from '../../db/client';
import {
  classifyApiKeyState,
  encodeEvidence,
  getRowsAffected,
  type PauseDatabaseExecutor,
  type ApiKeyStateRow,
} from './pause-db-helpers';
import type {
  ApiKeyPauseEvidence,
  ApiKeyPauseResult,
  ApiKeyPauseSource,
  ApiKeyResumeResult,
} from './pause-contract';

export type PauseDatabaseContext = {
  readonly db: PauseDatabaseExecutor;
  readonly schema: ReturnType<typeof getSchema>;
  readonly dialect: ReturnType<typeof getCurrentDialect>;
  readonly timestamp: number;
};

export type PauseTransition = {
  readonly name: string;
  readonly source: ApiKeyPauseSource;
  readonly reason: string;
  readonly actor: string | null;
  readonly evidence: ApiKeyPauseEvidence | null;
};

export type ResumeTransition = {
  readonly name: string;
  readonly actor: string;
  readonly reason: string;
};

function assertNever(value: never): never {
  throw new Error(`Unexpected API key state: ${String(value)}`);
}

function pauseEventKind(source: ApiKeyPauseSource): 'manual_pause' | 'auto_pause' {
  switch (source) {
    case 'manual':
      return 'manual_pause';
    case 'automatic':
      return 'auto_pause';
    default:
      return assertNever(source);
  }
}

export async function runPauseTransition(
  context: PauseDatabaseContext,
  request: PauseTransition
): Promise<ApiKeyPauseResult> {
  const { db, schema, dialect, timestamp } = context;

  return db.transaction(async (tx) => {
    const readState = async (): Promise<ApiKeyStateRow | undefined> => {
      const rows = await tx
        .select<ApiKeyStateRow>({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          pausedAt: schema.apiKeys.pausedAt,
          disabledAt: schema.apiKeys.disabledAt,
          expiresAt: schema.apiKeys.expiresAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.name, request.name))
        .limit(1);
      return rows[0];
    };

    const initialRow = await readState();
    const initialState = classifyApiKeyState(initialRow, timestamp);
    switch (initialState) {
      case 'not_found':
        return 'not_found';
      case 'disabled':
        return 'disabled';
      case 'paused':
        return 'already_paused';
      case 'active':
        break;
      default:
        return assertNever(initialState);
    }

    const update = tx
      .update(schema.apiKeys)
      .set({
        pausedAt: timestamp,
        pauseSource: request.source,
        pauseReason: request.reason,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(schema.apiKeys.name, request.name),
          isNull(schema.apiKeys.pausedAt),
          isNull(schema.apiKeys.disabledAt),
          or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, timestamp))
        )
      );
    const result =
      dialect === 'postgres' ? await update.returning({ id: schema.apiKeys.id }) : await update;

    if (getRowsAffected(result, dialect) === 0) {
      const currentState = classifyApiKeyState(await readState(), timestamp);
      switch (currentState) {
        case 'not_found':
          return 'not_found';
        case 'disabled':
          return 'disabled';
        case 'paused':
          return 'already_paused';
        case 'active':
          return 'already_paused';
        default:
          return assertNever(currentState);
      }
    }

    await tx.insert(schema.apiKeySecurityEvents).values({
      apiKeyId: initialRow?.id ?? null,
      keyName: request.name,
      eventKind: pauseEventKind(request.source),
      source: request.source,
      actor: request.actor,
      reason: request.reason,
      evidence: encodeEvidence(request.evidence, dialect),
      createdAt: timestamp,
    });
    return 'paused';
  });
}

export async function runResumeTransition(
  context: PauseDatabaseContext,
  request: ResumeTransition
): Promise<ApiKeyResumeResult> {
  const { db, schema, dialect, timestamp } = context;

  return db.transaction(async (tx) => {
    const readState = async (): Promise<ApiKeyStateRow | undefined> => {
      const rows = await tx
        .select<ApiKeyStateRow>({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          pausedAt: schema.apiKeys.pausedAt,
          disabledAt: schema.apiKeys.disabledAt,
          expiresAt: schema.apiKeys.expiresAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.name, request.name))
        .limit(1);
      return rows[0];
    };

    const initialRow = await readState();
    const initialState = classifyApiKeyState(initialRow, timestamp);
    switch (initialState) {
      case 'not_found':
        return 'not_found';
      case 'disabled':
        return 'disabled';
      case 'active':
        return 'not_paused';
      case 'paused':
        break;
      default:
        return assertNever(initialState);
    }

    const update = tx
      .update(schema.apiKeys)
      .set({ pausedAt: null, pauseSource: null, pauseReason: null, updatedAt: timestamp })
      .where(
        and(
          eq(schema.apiKeys.name, request.name),
          isNotNull(schema.apiKeys.pausedAt),
          isNull(schema.apiKeys.disabledAt),
          or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, timestamp))
        )
      );
    const result =
      dialect === 'postgres' ? await update.returning({ id: schema.apiKeys.id }) : await update;

    if (getRowsAffected(result, dialect) === 0) {
      const currentState = classifyApiKeyState(await readState(), timestamp);
      switch (currentState) {
        case 'not_found':
          return 'not_found';
        case 'disabled':
          return 'disabled';
        case 'active':
        case 'paused':
          return 'not_paused';
        default:
          return assertNever(currentState);
      }
    }

    const evidence = {
      callerId: request.actor,
      source: 'admin',
      timestamp,
    } satisfies ApiKeyPauseEvidence;
    await tx.insert(schema.apiKeySecurityEvents).values({
      apiKeyId: initialRow?.id ?? null,
      keyName: request.name,
      eventKind: 'resume',
      source: 'admin',
      actor: request.actor,
      reason: request.reason,
      evidence: encodeEvidence(evidence, dialect),
      createdAt: timestamp,
    });
    return 'resumed';
  });
}
