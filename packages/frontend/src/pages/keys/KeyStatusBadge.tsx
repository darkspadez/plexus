import { Badge } from '../../components/ui/Badge';
import type { KeySecurityStatus } from './keySecurityUtils';

const presentation: Record<
  KeySecurityStatus,
  { readonly label: string; readonly tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }
> = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  disabled: { label: 'Disabled', tone: 'neutral' },
  learning: { label: 'Learning', tone: 'warning' },
  observing: { label: 'Observing', tone: 'info' },
};

export const KeyStatusBadge = ({ status }: { readonly status: KeySecurityStatus }) => {
  const value = presentation[status];
  return <Badge status={value.tone}>{value.label}</Badge>;
};
