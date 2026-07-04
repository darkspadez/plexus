/**
 * mcp-schema.ts — Zod schema for the MCP server form (Mcp page).
 *
 * Mirrors the McpServer discriminated union in lib/api.ts exactly.
 * The mode field drives which fields are shown and which payload is sent.
 *
 * Note: headers and env are managed as separate React state (dynamic key-value
 * maps) and NOT part of this schema — they are merged at submit time, matching
 * the old handleSave() pattern in Mcp.tsx.
 */
import * as z from 'zod';

// ---------------------------------------------------------------------------
// Remote HTTP
// ---------------------------------------------------------------------------

export const remoteMcpFormSchema = z.object({
  mode: z.literal('remote_http'),
  serverName: z
    .string()
    .trim()
    .min(1, 'Server name is required.')
    .regex(
      /^[a-z0-9][a-z0-9-_]{1,62}$/,
      'Lowercase letters, digits, hyphens, underscores; must start with a letter or digit; 2–63 chars.'
    ),
  upstream_url: z.string().trim().min(1, 'Upstream URL is required.'),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Local HTTP
// ---------------------------------------------------------------------------

export const localMcpFormSchema = z.object({
  mode: z.literal('local_http'),
  serverName: z
    .string()
    .trim()
    .min(1, 'Server name is required.')
    .regex(
      /^[a-z0-9][a-z0-9-_]{1,62}$/,
      'Lowercase letters, digits, hyphens, underscores; must start with a letter or digit; 2–63 chars.'
    ),
  launcher: z.enum(['bunx', 'uvx']),
  package: z.string().trim().min(1, 'Package name is required.'),
  /** Raw args string — split by parseArguments at submit time */
  argsInput: z.string(),
  port: z.number().int().min(1).max(65535),
  path: z.string(),
  startup_timeout_ms: z.number().int().min(100),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export const mcpFormSchema = z.discriminatedUnion('mode', [
  remoteMcpFormSchema,
  localMcpFormSchema,
]);

export type RemoteMcpFormValues = z.infer<typeof remoteMcpFormSchema>;
export type LocalMcpFormValues = z.infer<typeof localMcpFormSchema>;
export type McpFormValues = z.infer<typeof mcpFormSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const REMOTE_MCP_DEFAULTS: RemoteMcpFormValues = {
  mode: 'remote_http',
  serverName: '',
  upstream_url: '',
  enabled: true,
};

export const LOCAL_MCP_DEFAULTS: LocalMcpFormValues = {
  mode: 'local_http',
  serverName: '',
  launcher: 'bunx',
  package: '',
  argsInput: '--port {{PORT}}',
  port: 7345,
  path: '/mcp',
  startup_timeout_ms: 30000,
  enabled: true,
};
