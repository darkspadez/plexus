/**
 * The subset of test files that exercise the database layer directly.
 * These are the only tests that need to run against both the SQLite and
 * Postgres projects.  All other tests mock the DB and only need one run.
 */
export const DB_TEST_FILES = [
  'src/db/**/*.test.ts',
  'src/db/__tests__/api-key-projections.test.ts',
  'src/db/__tests__/api-key-security-schema.test.ts',
  'src/db/__tests__/api-key-security-schema-parity.test.ts',
  'src/services/api-key-security/__tests__/api-key-pause-service.db.test.ts',
  'src/routes/management/__tests__/usage-summary.test.ts',
  'src/routes/management/__tests__/anomaly-policy.test.ts',
  'src/routes/management/__tests__/config-key-lifecycle.db.test.ts',
  'src/routes/management/__tests__/api-key-security-admin.db.test.ts',
  'src/services/__tests__/usage-storage-performance.test.ts',
  'src/services/api-key-security/__tests__/activity-recorder.db.test.ts',
  'src/utils/__tests__/auth.db.test.ts',
  'src/utils/__tests__/auth-surfaces.db.test.ts',
  'src/routes/inference/__tests__/embeddings.test.ts',
  'src/routes/inference/__tests__/completions.test.ts',
  'src/routes/inference/__tests__/transcriptions.test.ts',
  'src/routes/inference/__tests__/transcriptions-debug.test.ts',
  'src/routes/inference/__tests__/speech-debug.test.ts',
  'src/utils/__tests__/auth.test.ts',
  'src/routes/inference/__tests__/auth.test.ts',
  'src/routes/management/__tests__/admin-auth.test.ts',
  'src/routes/management/__tests__/auth-verify-quota-names.test.ts',
  'src/routes/__tests__/raw-passthrough.test.ts',
  'src/routes/mcp/__tests__/mcp-routes.test.ts',
  'src/routes/mcp/__tests__/plexus-mcp-routes.test.ts',
  'src/services/api-key-security/__tests__/anomaly-evaluation-scheduler.db.test.ts',
  'src/services/oauth/__tests__/dropped-oauth-providers.test.ts',
  'src/services/quota/__tests__/quota-enforcer.test.ts',
  'src/services/quota/__tests__/quota-scheduler.test.ts',
] as const;
