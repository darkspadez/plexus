import { EmbeddingsTransformer } from '../types/embeddings-transformer';
import { OpenAIEmbeddingsTransformer } from '../transformers/embeddings/openai';

export class EmbeddingsTransformerFactory {
  static getTransformer(providerType: string): EmbeddingsTransformer {
    switch (providerType.toLowerCase()) {
      case 'openai':
      case 'chat':
      default:
        return new OpenAIEmbeddingsTransformer();
    }
  }
}
