import { useEffect, useState } from 'react';
import { LockKeyhole, Save } from 'lucide-react';
import { api } from '../../lib/api';
import type { McpOAuthSettings as McpOAuthConfig } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { Switch } from '../ui/Switch';
import { DEFAULT_MCP_OAUTH_CONFIG } from './types';

function validateIssuerInput(raw: string): { valid: boolean; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Must use http:// or https://' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Enter a well-formed URL' };
  }
}

export function McpOAuthSettings() {
  const toast = useToast();
  const [config, setConfig] = useState<McpOAuthConfig>(DEFAULT_MCP_OAUTH_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuerInput, setIssuerInput] = useState('');

  useEffect(() => {
    api
      .getSystemSettings()
      .then((settings) => {
        const raw = settings.mcpOAuth as Partial<McpOAuthConfig> | undefined;
        const cfg: McpOAuthConfig = {
          enabled: raw?.enabled === true,
          provider: raw?.provider === 'plexus-idp' ? raw.provider : 'plexus-idp',
          ...(typeof raw?.issuer === 'string' && raw.issuer.trim()
            ? { issuer: raw.issuer.trim() }
            : {}),
        };
        setConfig(cfg);
        setIssuerInput(cfg.issuer ?? '');
        setLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load MCP OAuth settings:', e);
        toast.error('Failed to load MCP OAuth settings');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const issuerValidation = validateIssuerInput(issuerInput);

  const handleSave = async () => {
    if (!issuerValidation.valid) return;
    setSaving(true);
    try {
      const issuer = issuerInput.trim();
      const next: McpOAuthConfig = {
        enabled: config.enabled,
        provider: 'plexus-idp',
        ...(issuer ? { issuer } : {}),
      };
      await api.patchSystemSettings({ mcpOAuth: next });
      setConfig(next);
      setIssuerInput(next.issuer ?? '');
      toast.success('MCP OAuth settings saved');
    } catch (e) {
      toast.error((e as Error).message, 'Failed to save MCP OAuth settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="MCP OAuth"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={saving}
          disabled={!loaded || !issuerValidation.valid}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LockKeyhole size={16} className="text-accent" />
            <div>
              <p className="font-sans text-[12px] font-medium text-foreground">
                Enable OAuth for MCP clients
              </p>
              <p className="font-sans text-[11px] text-foreground-subtle">
                Shared OAuth authorization for each configured MCP server.
              </p>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onChange={(checked) => setConfig({ ...config, enabled: checked })}
            disabled={!loaded}
            aria-label="Toggle MCP OAuth on/off"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="mcpOAuthIssuer"
            className="font-sans text-[12px] font-medium text-foreground"
          >
            External issuer URL
          </label>
          <input
            id="mcpOAuthIssuer"
            type="url"
            value={issuerInput}
            onChange={(event) => setIssuerInput(event.target.value)}
            placeholder="https://your-instance.example.com"
            className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
          />
          {!issuerValidation.valid && (
            <span className="text-[11px] text-warning">{issuerValidation.error}</span>
          )}
          <p className="font-sans text-[11px] text-foreground-subtle leading-relaxed">
            Use the externally reachable URL for this Plexus instance, such as a Tailscale Funnel
            URL. Each MCP server derives its protected resource from this issuer, such as{' '}
            <code>/mcp/exa</code>. If this does not match the actual external URL, OAuth discovery
            metadata will point at the wrong origin and MCP connections can fail.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
