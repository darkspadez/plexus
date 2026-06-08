import { UnifiedEmbeddingsRequest, UnifiedEmbeddingsResponse } from './unified';

/**
 * Embeddings transformer interface for provider-type-aware request/response transformation.
 *
 * Each embeddings provider type implements this interface to handle:
 * - URL construction (e.g. Gemini /v1beta/models/{model}:embedContent)
 * - Auth headers (e.g. x-goog-api-key for Gemini)
 * - Request/response transformation between OpenAI and provider formats
 */
export interface EmbeddingsTransformer {
  readonly name: string;
  readonly defaultEndpoint: string;

  getEndpoint?(request: UnifiedEmbeddingsRequest): string;

  getAuthHeaders?(apiKey: string, headers: Record<string, string>): void;

  transformRequest(request: UnifiedEmbeddingsRequest): Promise<any>;

  transformResponse(
    response: any,
    request?: UnifiedEmbeddingsRequest
  ): Promise<UnifiedEmbeddingsResponse>;

  formatResponse(response: UnifiedEmbeddingsResponse): Promise<any>;

  extractUsage(eventData: string): { prompt_tokens?: number } | undefined;
}
