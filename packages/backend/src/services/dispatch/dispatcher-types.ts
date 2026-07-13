export interface RetryAttemptRecord {
  index: number;
  provider: string;
  model: string;
  apiType?: string;
  status: 'success' | 'failed' | 'skipped';
  reason: string;
  statusCode?: number;
  retryable?: boolean;
  providerResponseHeaders?: Record<string, string>;
}
