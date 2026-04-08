import { FastifyInstance } from 'fastify';
import { getConfig, MetadataOverrides } from '../../config';
import { PricingManager } from '../../services/pricing-manager';
import {
  ModelMetadataManager,
  NormalizedModelMetadata,
} from '../../services/model-metadata-manager';

/**
 * Deep-merge validated overrides on top of base metadata.
 * Override fields win; nested objects are merged shallowly.
 * Overrides are validated at write-time by ModelConfigSchema (Zod).
 */
function mergeMetadata(
  base: NormalizedModelMetadata,
  overrides: MetadataOverrides
): NormalizedModelMetadata {
  const merged = { ...base };
  if (overrides.name !== undefined) merged.name = overrides.name;
  if (overrides.description !== undefined) merged.description = overrides.description;
  if (overrides.context_length !== undefined) merged.context_length = overrides.context_length;
  if (overrides.supported_parameters !== undefined)
    merged.supported_parameters = overrides.supported_parameters;
  if (overrides.architecture !== undefined) {
    merged.architecture = { ...merged.architecture, ...overrides.architecture };
  }
  if (overrides.pricing !== undefined) {
    merged.pricing = { ...merged.pricing, ...overrides.pricing };
  }
  if (overrides.top_provider !== undefined) {
    merged.top_provider = { ...merged.top_provider, ...overrides.top_provider };
  }
  return merged;
}

export async function registerModelsRoute(fastify: FastifyInstance) {
  /**
   * GET /v1/models
   * Returns a list of available model aliases configured in plexus.yaml,
   * following the OpenRouter/OpenAI model list format.
   *
   * When an alias has a `metadata` block configured, the response includes
   * enriched fields (name, description, context_length, architecture, pricing,
   * supported_parameters, top_provider) sourced from the configured catalog.
   *
   * Note: Direct provider/model syntax (e.g., "stima/gemini-2.5-flash") is NOT
   * included in this list, as it's intended for debugging only.
   */
  fastify.get('/v1/models', async (request, reply) => {
    const config = getConfig();
    const metadataManager = ModelMetadataManager.getInstance();

    const created = Math.floor(Date.now() / 1000);

    const models = Object.entries(config.models).map(([aliasId, modelConfig]) => {
      const metaConfig = modelConfig?.metadata;

      const base = {
        id: aliasId,
        object: 'model' as const,
        created,
        owned_by: 'plexus',
      };

      if (!metaConfig) {
        return base;
      }

      // For 'custom' source, use overrides directly as the metadata
      if (metaConfig.source === 'custom') {
        const ov = metaConfig.overrides;
        if (!ov) return base;
        return {
          ...base,
          ...(ov.name !== undefined && { name: ov.name }),
          ...(ov.description !== undefined && { description: ov.description }),
          ...(ov.context_length !== undefined && { context_length: ov.context_length }),
          ...(ov.architecture !== undefined && { architecture: ov.architecture }),
          ...(ov.pricing !== undefined && { pricing: ov.pricing }),
          ...(ov.supported_parameters !== undefined && {
            supported_parameters: ov.supported_parameters,
          }),
          ...(ov.top_provider !== undefined && { top_provider: ov.top_provider }),
        };
      }

      // Look up enriched metadata from the appropriate source
      const enriched = metadataManager.getMetadata(metaConfig.source, metaConfig.source_path!);
      if (!enriched) {
        return base;
      }

      // Apply overrides on top of catalog data if present
      const final = metaConfig.overrides ? mergeMetadata(enriched, metaConfig.overrides) : enriched;

      return {
        ...base,
        name: final.name,
        ...(final.description !== undefined && { description: final.description }),
        ...(final.context_length !== undefined && { context_length: final.context_length }),
        ...(final.architecture !== undefined && { architecture: final.architecture }),
        ...(final.pricing !== undefined && { pricing: final.pricing }),
        ...(final.supported_parameters !== undefined && {
          supported_parameters: final.supported_parameters,
        }),
        ...(final.top_provider !== undefined && { top_provider: final.top_provider }),
      };
    });

    return reply.send({
      object: 'list',
      data: models,
    });
  });

  /**
   * GET /v1/metadata/search
   * Search model metadata from a configured external catalog source.
   * Intended for frontend autocomplete when assigning metadata to an alias.
   *
   * Query parameters:
   *   - source (required): "openrouter" | "models.dev" | "catwalk"
   *   - q (optional): substring search query
   *   - limit (optional): max results to return (default 50, max 200)
   *
   * Returns: { data: [{ id, name }], count }
   */
  fastify.get('/v1/metadata/search', async (request, reply) => {
    const metadataManager = ModelMetadataManager.getInstance();
    const query = request.query as { source?: string; q?: string; limit?: string };

    const source = query.source as 'openrouter' | 'models.dev' | 'catwalk' | undefined;
    if (!source || !['openrouter', 'models.dev', 'catwalk'].includes(source)) {
      return reply.status(400).send({
        error: `Missing or invalid 'source' parameter. Must be one of: openrouter, models.dev, catwalk`,
      });
    }

    if (!metadataManager.isInitialized(source)) {
      return reply.status(503).send({
        error: `Metadata source '${source}' is not yet loaded or failed to load`,
      });
    }

    const q = query.q ?? '';
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
    const results = metadataManager.search(source, q, limit);

    return reply.send({
      data: results,
      count: results.length,
    });
  });

  /**
   * GET /v1/metadata/model
   * Fetch the full NormalizedModelMetadata for a single model from a catalog source.
   * Used by the frontend "Populate from catalog" button to pre-fill override fields.
   *
   * Query parameters:
   *   - source (required): "openrouter" | "models.dev" | "catwalk"
   *   - path (required): source_path identifier (e.g. "openai/gpt-4.1-nano")
   *
   * Returns: full NormalizedModelMetadata or 404
   */
  fastify.get('/v1/metadata/model', async (request, reply) => {
    const metadataManager = ModelMetadataManager.getInstance();
    const query = request.query as { source?: string; path?: string };

    const source = query.source as 'openrouter' | 'models.dev' | 'catwalk' | undefined;
    if (!source || !['openrouter', 'models.dev', 'catwalk'].includes(source)) {
      return reply.status(400).send({
        error: `Missing or invalid 'source' parameter. Must be one of: openrouter, models.dev, catwalk`,
      });
    }

    const path = query.path;
    if (!path) {
      return reply.status(400).send({ error: `Missing required 'path' parameter` });
    }

    if (!metadataManager.isInitialized(source)) {
      return reply.status(503).send({
        error: `Metadata source '${source}' is not yet loaded or failed to load`,
      });
    }

    const metadata = metadataManager.getMetadata(source, path);
    if (!metadata) {
      return reply.status(404).send({
        error: `Model '${path}' not found in source '${source}'`,
      });
    }

    return reply.send(metadata);
  });

  /**
   * GET /v1/openrouter/models
   * Returns a list of OpenRouter model slugs, optionally filtered by a search query.
   * Query parameter: ?q=search-term
   */
  fastify.get('/v1/openrouter/models', async (request, reply) => {
    const pricingManager = PricingManager.getInstance();

    if (!pricingManager.isInitialized()) {
      return reply.status(503).send({
        error: 'OpenRouter pricing data not yet loaded',
      });
    }

    const query = (request.query as { q?: string }).q || '';
    const slugs = pricingManager.searchModelSlugs(query);

    return reply.send({
      data: slugs,
      count: slugs.length,
    });
  });
}
