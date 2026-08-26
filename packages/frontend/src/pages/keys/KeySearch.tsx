import { Search } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import type { KeysTab } from './types';

interface KeySearchProps {
  readonly activeTab: KeysTab;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export const KeySearch = ({ activeTab, value, onChange }: KeySearchProps) => (
  <Card className="mb-6">
    <div style={{ position: 'relative' }}>
      <Search
        size={16}
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-secondary)',
        }}
      />
      <Input
        placeholder={activeTab === 'keys' ? 'Search keys...' : 'Search quotas...'}
        style={{ paddingLeft: '36px' }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  </Card>
);
