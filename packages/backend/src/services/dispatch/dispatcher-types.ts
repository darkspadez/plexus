export interface RetryAttemptRecord {
  index: number;
  provider: string;
  model: string;
  /** Post-adapter model actually dispatched (providerPayload.model). Absent when no payload was dispatched. */
  upstreamModel?: string;
  apiType?: string;
  status: 'success' | 'failed' | 'skipped';
  reason: string;
  statusCode?: number;
  retryable?: boolean;
  providerResponseHeaders?: Record<string, string>;
}
