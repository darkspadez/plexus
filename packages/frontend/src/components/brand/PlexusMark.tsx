import React from 'react';

interface Props {
  className?: string;
  title?: string;
}

export const PlexusMark: React.FC<Props> = ({ className, title }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path
      d="M6 7 L18 7 M6 7 L12 17 M18 7 L12 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="6" cy="7" r="2.25" fill="currentColor" />
    <circle cx="18" cy="7" r="2.25" fill="currentColor" />
    <circle cx="12" cy="17" r="2.25" fill="currentColor" />
  </svg>
);
