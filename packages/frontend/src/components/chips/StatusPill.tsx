import React from 'react';
import { Pill } from './Pill';
import { type Status, statusTone } from '../../lib/status-vocab';

interface StatusPillProps {
  status: Status;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, className }) => {
  const tone = statusTone(status);
  return (
    <Pill tone={tone} className={className}>
      {status}
    </Pill>
  );
};
