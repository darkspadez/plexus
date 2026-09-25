import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import {
  CLEANUP_CATEGORY_IDS,
  purgeDatabase,
  scanDatabase,
} from '../../services/maintenance/database-cleanup-service';
import {
  CompactionInProgressError,
  compactDatabase,
} from '../../services/maintenance/database-compactor';

const purgeBodySchema = z.object({
  categories: z.array(z.enum(CLEANUP_CATEGORY_IDS)).min(1),
});

const compactBodySchema = z.object({
  full: z.boolean().optional(),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function registerDatabaseMaintenanceRoutes(fastify: FastifyInstance) {
  /** Scan for orphaned / unused data and report the database size. Read-only. */
  fastify.get('/v0/management/database/cleanup', async (_request, reply) => {
    try {
      return reply.send({ data: await scanDatabase() });
    } catch (error) {
      logger.error('Database cleanup scan failed', error);
      return reply.code(500).send({ error: errorMessage(error) });
    }
  });

  /** Delete the selected categories, re-classified by a fresh scan. */
  fastify.post('/v0/management/database/purge', async (request, reply) => {
    const parsed = purgeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
    }
    try {
      const categories = [...new Set(parsed.data.categories)];
      return reply.send({ data: await purgeDatabase(categories) });
    } catch (error) {
      logger.error('Database cleanup purge failed', error);
      return reply.code(500).send({ error: errorMessage(error) });
    }
  });

  /** VACUUM the database. Only one compaction may run at a time (409 otherwise). */
  fastify.post('/v0/management/database/compact', async (request, reply) => {
    const parsed = compactBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
    }
    try {
      return reply.send({ data: await compactDatabase({ full: parsed.data.full }) });
    } catch (error) {
      if (error instanceof CompactionInProgressError) {
        return reply.code(409).send({ error: error.message });
      }
      logger.error('Database compaction failed', error);
      return reply.code(500).send({ error: errorMessage(error) });
    }
  });
}
