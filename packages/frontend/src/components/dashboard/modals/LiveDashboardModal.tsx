/**
 * @file LiveDashboardModal.tsx
 *
 * Shared modal shell used as the drill-in for the two Live Metrics cards
 * salvaged onto AdminDashboard (Concurrency, Model Stack). Trimmed from
 * upstream's version, which also expanded to an embedded DetailedUsage
 * analytics page and seven other now-deleted cards — see
 * docs/DESIGN_MIGRATION.md.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ModalCardId } from '../liveTypes';
import type { LiveDashboardData } from '../../../hooks/useLiveDashboardData';
import { ModelTimelineModal } from './ModelTimelineModal';
import { ConcurrencyModal } from './ConcurrencyModal';

export interface LiveDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalCard: ModalCardId | null;
  data: LiveDashboardData;
}

export const getLiveModalTitle = (modalCard: ModalCardId | null): string => {
  switch (modalCard) {
    case 'modelstack':
      return 'Model Stack + Runtime';
    case 'concurrency':
      return 'Concurrency';
    default:
      return '';
  }
};

export const LiveDashboardModal: React.FC<LiveDashboardModalProps> = ({
  isOpen,
  onClose,
  modalCard,
  data,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const title = getLiveModalTitle(modalCard);

  const renderContent = () => {
    switch (modalCard) {
      case 'modelstack':
        return <ModelTimelineModal modelTimeline={data.modelTimeline} />;
      case 'concurrency':
        return (
          <ConcurrencyModal
            concurrencyHistory={data.concurrencyHistory}
            totalConcurrentRequests={data.totalConcurrentRequests}
            concurrencyProviders={data.concurrencyProviders}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] overflow-auto rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={24} className="text-foreground-muted" />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};
