import type { ChangeEvent, RefObject } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import type { CardLayout } from '../../types/card';

interface CardLayoutCardProps {
  cardLayout: CardLayout;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImport: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function CardLayoutCard({
  cardLayout,
  fileInputRef,
  onExport,
  onImport,
  onFileSelect,
}: CardLayoutCardProps) {
  return (
    <SectionCard
      title="Card Layout"
      extra={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onExport}
            leftIcon={<Download size={14} />}
          >
            Export
          </Button>
          <Button variant="primary" size="sm" onClick={onImport} leftIcon={<Upload size={14} />}>
            Import
          </Button>
        </div>
      }
    >
      <p className="text-sm text-foreground-muted mb-4">
        Import or export your Live Metrics card layout configuration.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onFileSelect}
      />

      <div>
        <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground-subtle mb-3">
          Current Card Order
        </h4>
        <div className="flex flex-wrap gap-2">
          {cardLayout.length === 0 && (
            <p className="text-xs text-foreground-subtle italic">
              Default layout — no customizations saved.
            </p>
          )}
          {cardLayout.map((card, index) => (
            <div
              key={card.id}
              className="px-3 py-1.5 bg-surface-elevated rounded-md border border-border text-xs text-foreground"
            >
              <span className="text-foreground-subtle mr-2">{index + 1}.</span>
              {card.id}
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
