import React from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import type { QuotaCheckResult } from '../../types/quota';

interface AntigravityQuotaDisplayProps {
  result: QuotaCheckResult;
  isCollapsed: boolean;
}

export const AntigravityQuotaDisplay: React.FC<AntigravityQuotaDisplayProps> = ({
  result,
  isCollapsed,
}) => {
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

  const worstStatus = windows.reduce<string>((worst, w) => {
    const order = ['ok', 'warning', 'critical', 'exhausted'];
    return order.indexOf(w.status ?? 'ok') > order.indexOf(worst) ? (w.status ?? 'ok') : worst;
  }, 'ok');

  if (isCollapsed) {
    const status = worstStatus;
    return (
      <div className="px-2 py-2 flex justify-center">
        {status === 'ok' ? (
          <CheckCircle2 size={18} className="text-success" />
        ) : (
          <AlertTriangle
            size={18}
            className={clsx(status === 'warning' ? 'text-warning' : 'text-danger')}
          />
        )}
      </div>
    );
  }

  if (windows.length === 0) {
    return (
      <div className="px-2 py-2 flex items-center gap-2 text-text-secondary">
        <TrendingUp size={16} />
        <span className="text-xs italic">No quota data</span>
      </div>
    );
  }

  return (
    <div className="px-2 py-1 grid grid-cols-3 gap-x-3 gap-y-2">
      {windows.map((window, index) => {
        const label = window.description || window.windowLabel || `Window ${index + 1}`;
        const pct = Math.round(window.utilizationPercent ?? 0);
        const barColor =
          window.status === 'exhausted' || window.status === 'critical'
            ? 'bg-danger'
            : window.status === 'warning'
              ? 'bg-warning'
              : 'bg-success';
        const textColor =
          window.status === 'exhausted' || window.status === 'critical'
            ? 'text-danger'
            : window.status === 'warning'
              ? 'text-warning'
              : 'text-success';
        return (
          <div key={index} className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-baseline justify-between gap-1 min-w-0">
              <span
                className="text-[10px] text-text-secondary font-medium truncate leading-tight"
                title={label}
              >
                {label}
              </span>
              <span className={clsx('text-[10px] font-semibold shrink-0', textColor)}>{pct}%</span>
            </div>
            <div className="h-1 w-full bg-bg-hover rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-500', barColor)}
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
