/**
 * mcp-schema.test.ts — Characterization tests for the MCP server form schema.
 *
 * Locks down the discriminated union behavior and serialization for both
 * remote_http and local_http server types. Any change that breaks these
 * breaks API payload parity.
 */
import { expect, test, describe } from 'vitest';
import {
  mcpFormSchema,
  remoteMcpFormSchema,
  localMcpFormSchema,
  REMOTE_MCP_DEFAULTS,
  LOCAL_MCP_DEFAULTS,
} from '../mcp-schema';
import { parseArguments } from '../../../lib/parseArguments';
import type { RemoteMcpServer, LocalMcpServer } from '../../../lib/api';

// ---------------------------------------------------------------------------
// Remote HTTP
// ---------------------------------------------------------------------------

describe('remoteMcpFormSchema', () => {
  test('accepts a valid remote HTTP server', () => {
    const result = remoteMcpFormSchema.safeParse({
      mode: 'remote_http',
      serverName: 'my-server',
      upstream_url: 'https://mcp.example.com/mcp',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  test('requires serverName', () => {
    const result = remoteMcpFormSchema.safeParse({
      mode: 'remote_http',
      serverName: '',
      upstream_url: 'https://example.com',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  test('requires upstream_url', () => {
    const result = remoteMcpFormSchema.safeParse({
      mode: 'remote_http',
      serverName: 'my-server',
      upstream_url: '',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  test('defaults are valid', () => {
    // Only check the schema fields (not serverName which would be empty)
    const result = remoteMcpFormSchema.safeParse({
      ...REMOTE_MCP_DEFAULTS,
      serverName: 'test',
      upstream_url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Local HTTP
// ---------------------------------------------------------------------------

describe('localMcpFormSchema', () => {
  test('accepts a valid local HTTP server', () => {
    const result = localMcpFormSchema.safeParse({
      mode: 'local_http',
      serverName: 'local-server',
      launcher: 'bunx',
      package: '@example/mcp-server',
      argsInput: '--port {{PORT}}',
      port: 7345,
      path: '/mcp',
      startup_timeout_ms: 30000,
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  test('requires package name', () => {
    const result = localMcpFormSchema.safeParse({
      ...LOCAL_MCP_DEFAULTS,
      serverName: 'test',
      package: '',
    });
    expect(result.success).toBe(false);
  });

  test('accepts uvx launcher', () => {
    const result = localMcpFormSchema.safeParse({
      ...LOCAL_MCP_DEFAULTS,
      serverName: 'uvx-server',
      package: 'mcp-server',
      launcher: 'uvx',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid launcher', () => {
    const result = localMcpFormSchema.safeParse({
      ...LOCAL_MCP_DEFAULTS,
      serverName: 'test',
      package: 'some-pkg',
      launcher: 'npm',
    });
    expect(result.success).toBe(false);
  });

  test('defaults are valid (with non-empty package and serverName)', () => {
    const result = localMcpFormSchema.safeParse({
      ...LOCAL_MCP_DEFAULTS,
      serverName: 'test',
      package: '@example/mcp',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// serverName format validation (regression guard for /^[a-z0-9][a-z0-9-_]{1,62}$/)
// ---------------------------------------------------------------------------

describe('serverName format validation', () => {
  const baseRemote = {
    mode: 'remote_http' as const,
    upstream_url: 'https://example.com/mcp',
    enabled: true,
  };

  test('rejects name with uppercase letters and space ("My Server")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: 'My Server' });
    expect(result.success).toBe(false);
  });

  test('rejects single-character name ("x")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: 'x' });
    expect(result.success).toBe(false);
  });

  test('rejects name starting with hyphen ("-bad")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: '-bad' });
    expect(result.success).toBe(false);
  });

  test('rejects name with internal space ("a b")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: 'a b' });
    expect(result.success).toBe(false);
  });

  test('accepts a valid 2-char name ("ab")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: 'ab' });
    expect(result.success).toBe(true);
  });

  test('accepts names with hyphens and underscores ("my_server-01")', () => {
    const result = remoteMcpFormSchema.safeParse({ ...baseRemote, serverName: 'my_server-01' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

describe('mcpFormSchema discriminated union', () => {
  test('routes remote_http to remote schema', () => {
    const result = mcpFormSchema.safeParse({
      mode: 'remote_http',
      serverName: 'my-server',
      upstream_url: 'https://example.com/mcp',
      enabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('remote_http');
    }
  });

  test('routes local_http to local schema', () => {
    const result = mcpFormSchema.safeParse({
      mode: 'local_http',
      serverName: 'local',
      launcher: 'bunx',
      package: 'some-pkg',
      argsInput: '--port {{PORT}}',
      port: 7345,
      path: '/mcp',
      startup_timeout_ms: 30000,
      enabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('local_http');
    }
  });

  test('rejects unknown mode', () => {
    const result = mcpFormSchema.safeParse({
      mode: 'stdio',
      serverName: 'test',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Serialization — mapping form values to McpServer API payload
// ---------------------------------------------------------------------------

describe('MCP payload serialization', () => {
  test('remote_http payload matches api.saveMcpServer expected shape', () => {
    const headers = { Authorization: 'Bearer token' };
    // Simulate what McpServerSheet onSubmit does for remote_http
    const formValues = {
      mode: 'remote_http' as const,
      serverName: 'my-server',
      upstream_url: 'https://mcp.example.com/mcp',
      enabled: true,
    };
    const payload: RemoteMcpServer = {
      mode: 'remote_http',
      upstream_url: formValues.upstream_url,
      enabled: formValues.enabled,
      headers,
    };
    expect(payload).toMatchObject({
      mode: 'remote_http',
      upstream_url: 'https://mcp.example.com/mcp',
      enabled: true,
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('local_http payload matches api.saveMcpServer expected shape', () => {
    const headers: Record<string, string> = {};
    const env = { API_KEY: 'secret' };
    const formValues = {
      mode: 'local_http' as const,
      serverName: 'local-server',
      launcher: 'bunx' as const,
      package: '@example/mcp-server',
      argsInput: '--port {{PORT}}',
      port: 7345,
      path: '/mcp',
      startup_timeout_ms: 30000,
      enabled: true,
    };
    const payload: LocalMcpServer = {
      mode: 'local_http',
      enabled: formValues.enabled,
      launcher: formValues.launcher,
      package: formValues.package,
      args: parseArguments(formValues.argsInput),
      env,
      port: formValues.port,
      path: formValues.path,
      startup_timeout_ms: formValues.startup_timeout_ms,
      headers,
    };
    expect(payload).toMatchObject({
      mode: 'local_http',
      enabled: true,
      launcher: 'bunx',
      package: '@example/mcp-server',
      args: ['--port', '{{PORT}}'],
      env: { API_KEY: 'secret' },
      port: 7345,
      path: '/mcp',
      startup_timeout_ms: 30000,
      headers: {},
    });
  });

  test('parseArguments is called to convert argsInput to args array', () => {
    const argsInput = '--port {{PORT}} --debug "with spaces"';
    const args = parseArguments(argsInput);
    expect(args).toEqual(['--port', '{{PORT}}', '--debug', 'with spaces']);
  });
});
