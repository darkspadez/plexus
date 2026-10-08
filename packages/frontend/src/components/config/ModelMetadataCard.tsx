import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

interface ModelMetadataCardProps {
  loading: boolean;
  onRefresh: () => void;
}

export function ModelMetadataCard({ loading, onRefresh }: ModelMetadataCardProps) {
  return (
    <SectionCard
      title="Model Metadata"
      extra={
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          isLoading={loading}
          leftIcon={<RefreshCw size="0.875rem" />}
        >
          Refresh Metadata
        </Button>
      }
    >
      <p className="text-sm text-foreground-muted">
        Catalog metadata for model aliases auto-refreshes every 60 minutes. Use this to trigger an
        immediate reload from OpenRouter, models.dev, and Catwalk.
      </p>
    </SectionCard>
  );
}
