import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { KeyPolicyPreview } from '../../lib/api/keySecurity';
import type { KeyConfig } from '../../lib/api/keys';
import { KeyStatusBadge } from './KeyStatusBadge';
import { keySecurityStatus } from './keySecurityUtils';
import { formatExpiry } from './keyUtils';

interface DisabledKeyListProps {
  readonly keys: readonly KeyConfig[];
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly policies: Readonly<Record<string, KeyPolicyPreview>>;
  readonly onSecurity: (key: KeyConfig) => void;
}

export const DisabledKeyList = ({
  keys,
  isOpen,
  onOpenChange,
  policies,
  onSecurity,
}: DisabledKeyListProps) => (
  <Card className="mb-6">
    <button
      type="button"
      className="flex w-full items-center justify-between text-left"
      onClick={() => onOpenChange(!isOpen)}
      aria-expanded={isOpen}
    >
      <span className="font-heading text-sm font-semibold text-text">
        Disabled Keys ({keys.length})
      </span>
      <ChevronDown
        size={16}
        className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
    {isOpen && (
      <div className="mt-4 overflow-x-auto">
        {keys.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-muted">No disabled keys found</div>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {keys.map((key) => (
                <article
                  key={key.key}
                  className="rounded-md border border-border-glass bg-bg-subtle p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text">{key.key}</span>
                    <KeyStatusBadge status={keySecurityStatus(key, policies[key.key])} />
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {key.disabledAt
                      ? `Disabled ${formatExpiry(key.disabledAt)}`
                      : `Expired ${key.expiresAt ? formatExpiry(key.expiresAt) : ''}`}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    leftIcon={<ShieldCheck size={14} />}
                    onClick={() => onSecurity(key)}
                  >
                    Security details
                  </Button>
                </article>
              ))}
            </div>
            <table className="hidden w-full border-collapse font-body text-[13px] md:table">
              <thead>
                <tr className="border-b border-border-glass text-left text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-3 py-2">Key Name</th>
                  <th className="px-3 py-2">Expiration</th>
                  <th className="px-3 py-2">Disabled</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.key} className="border-b border-border-glass text-text">
                    <td className="px-3 py-3 font-medium">{key.key}</td>
                    <td className="px-3 py-3">
                      {key.expiresAt ? formatExpiry(key.expiresAt) : '-'}
                    </td>
                    <td className="px-3 py-3">
                      {key.disabledAt ? formatExpiry(key.disabledAt) : 'Expired'}
                    </td>
                    <td className="px-3 py-3 text-text-muted">{key.comment || '-'}</td>
                    <td className="px-3 py-3">
                      <KeyStatusBadge status={keySecurityStatus(key, policies[key.key])} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSecurity(key)}
                        aria-label={`View security details for ${key.key}`}
                      >
                        <ShieldCheck size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    )}
  </Card>
);
