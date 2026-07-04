/**
 * Footer — app-wide content footer.
 *
 * Pinned to the bottom of the content column (see MainLayout). Carries the app
 * version, which previously lived in the Sidebar brand header. The version is
 * injected at build time via `process.env.APP_VERSION` (replaced by build.ts;
 * defaults to 'dev' in local dev).
 */
import React from 'react';

export const Footer: React.FC = () => {
  // @ts-expect-error — replaced at build time by build.ts
  const appVersion: string = process.env.APP_VERSION || 'dev';

  return (
    <footer className="shrink-0 border-t border-border px-4 py-3 text-center text-xs text-foreground-subtle">
      © 2025–2026 Plexus · {appVersion}
    </footer>
  );
};
