import React from 'react';
import { Tooltip } from './Tooltip';

interface PerformanceToolTipProps {
  duration: string;
  semanticBytes: string;
  rawBytes?: string;
  bytesPerSec?: string;
  estimatedTokensPerSec?: string;
  children: React.ReactNode;
}

export const PerformanceToolTip: React.FC<PerformanceToolTipProps> = ({
  duration,
  semanticBytes,
  rawBytes,
  bytesPerSec,
  estimatedTokensPerSec,
  children,
}) => {
  const rows = [
    ['Duration:', duration],
    ['Token bytes:', semanticBytes],
    ...(rawBytes ? [['Raw bytes:', rawBytes]] : []),
    ...(bytesPerSec ? [['Throughput:', `${bytesPerSec}/s`]] : []),
    ...(estimatedTokensPerSec ? [['Est. tok/s:', estimatedTokensPerSec]] : []),
  ];

  return (
    <Tooltip
      variant="surface"
      content={
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            gap: '0.25rem 0.75rem',
            minWidth: '11.25rem',
            fontSize: '0.75rem',
          }}
        >
          <strong
            style={{
              gridColumn: '1 / -1',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.25rem',
              marginBottom: '2px',
            }}
          >
            Live performance
          </strong>
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: 'var(--foreground-muted)' }}>{label}</span>
              <span style={{ fontFamily: 'monospace', textAlign: 'right' }}>{value}</span>
            </React.Fragment>
          ))}
        </div>
      }
    >
      {children}
    </Tooltip>
  );
};
