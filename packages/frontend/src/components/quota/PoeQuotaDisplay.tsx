import React from 'react';
import { clsx } from 'clsx';
import { Wallet, AlertTriangle } from 'lucide-react';
import { formatPointsFull } from '../../lib/format';
import type { QuotaCheckResult } from '../../types/quota';

interface PoeQuotaDisplayProps {
  result: QuotaCheckResult;
  isCollapsed: boolean;
}

export const PoeQuotaDisplay: React.FC<PoeQuotaDisplayProps> = ({ result, isCollapsed }) => {
  if (!result.success) {
    return (
      <div className="px-2 py-2">
        <div
          className={clsx('flex items-center gap-2 text-danger', isCollapsed && 'justify-center')}
        >
          <AlertTriangle size={16} />
          {!isCollapsed && <span className="text-xs">Error</span>}
        </div>
      </div>
    );
  }

  const windows = result.windows || [];
  const subscriptionWindow = windows.find((w) => w.windowType === 'subscription');
  const balance = subscriptionWindow?.remaining;

  if (isCollapsed) {
    return (
      <div className="px-2 py-2 flex justify-center">
        <Wallet size={18} className="text-info" />
      </div>
    );
  }

  return (
    <div className="px-2 py-1 space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        <Wallet size={14} className="text-info" />
        <span className="text-xs font-semibold text-text whitespace-nowrap">POE</span>
      </div>
      {balance !== undefined && (
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-text-secondary">Points</span>
          <span className="text-xs font-semibold text-info ml-auto">
            {formatPointsFull(balance)} pts
          </span>
        </div>
      )}
    </div>
  );
};
