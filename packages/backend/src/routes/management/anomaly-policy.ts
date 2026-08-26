import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { AnomalyPolicyService } from '../../services/api-key-security/anomaly-policy-service';

const GLOBAL_POLICY_PATH = '/v0/management/security/anomaly-policy';
const KEY_POLICY_PATH = '/v0/management/keys/:name/anomaly-policy';

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ error: 'Validation failed', details: error.issues });
  }
  logger.error('Failed to process API key anomaly policy request', error);
  return reply.code(500).send({ error: 'Internal server error' });
}

export async function registerAnomalyPolicyRoutes(
  fastify: FastifyInstance,
  policyService: AnomalyPolicyService
): Promise<void> {
  fastify.get(GLOBAL_POLICY_PATH, async (_request, reply) => {
    try {
      return reply.send(await policyService.getSnapshot());
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.put(GLOBAL_POLICY_PATH, async (request, reply) => {
    try {
      return reply.send(await policyService.replaceGlobalPolicy(request.body));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch(GLOBAL_POLICY_PATH, async (request, reply) => {
    try {
      return reply.send(await policyService.replaceGlobalPolicy(request.body));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get<{ Params: { name: string } }>(KEY_POLICY_PATH, async (request, reply) => {
    try {
      const policy = await policyService.getKeyPolicy(request.params.name);
      if (!policy) return reply.code(404).send({ error: 'API key not found' });
      return reply.send(policy);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.put<{ Params: { name: string } }>(KEY_POLICY_PATH, async (request, reply) => {
    try {
      const policy = await policyService.setKeyPolicy(request.params.name, request.body);
      if (!policy) return reply.code(404).send({ error: 'API key not found' });
      return reply.send(policy);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch<{ Params: { name: string } }>(KEY_POLICY_PATH, async (request, reply) => {
    try {
      const policy = await policyService.setKeyPolicy(request.params.name, request.body);
      if (!policy) return reply.code(404).send({ error: 'API key not found' });
      return reply.send(policy);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
