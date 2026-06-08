import { UnifiedEmbeddingsRequest, UnifiedEmbeddingsResponse } from './unified';

export interface EmbeddingsTransformer {
  readonly name: string;
  readonly defaultEndpoint: string;

  getEndpoint?(request: UnifiedEmbeddingsRequest): string;

  getAuthHeaders?(apiKey: string, headers: Record<string, string>): void;

  transformRequest(request: UnifiedEmbeddingsRequest): Promise<any>;

  transformResponse(response: any): Promise<UnifiedEmbeddingsResponse>;

  formatResponse(response: UnifiedEmbeddingsResponse): Promise<any>;

  extractUsage(eventData: string): { prompt_tokens?: number } | undefined;
}
