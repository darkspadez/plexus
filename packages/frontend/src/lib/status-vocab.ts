/**
 * Status vocabulary translation — see DESIGN_SYSTEM.md §7.4.
 *
 * The backend returns its own status literals (per-resource); the design system
 * fixes a single vocabulary the UI uses everywhere. This module is the only
 * place where the two meet. Keep it exhaustive — TypeScript catches drift.
 */

export type Status =
  | 'Healthy'
  | 'Degraded'
  | 'Cooldown'
  | 'Disabled'
  | 'Active'
  | 'Idle'
  | 'Exceeded'
  | 'Expired'
  | 'Refreshing'
  | 'Error';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const statusTone = (status: Status): StatusTone => {
  switch (status) {
    case 'Healthy':
    case 'Active':
      return 'success';
    case 'Degraded':
    case 'Cooldown':
    case 'Refreshing':
      return 'warning';
    case 'Exceeded':
    case 'Expired':
    case 'Error':
      return 'danger';
    case 'Disabled':
    case 'Idle':
      return 'neutral';
  }
  const _exhaustive: never = status;
  return _exhaustive;
};

/**
 * Map a backend meter status (`ok` | `warning` | `critical` | `exhausted`) to
 * the design-system vocab. Used for quotas, rate-limited resources.
 */
export type BackendMeterStatus = 'ok' | 'warning' | 'critical' | 'exhausted';
export const fromMeterStatus = (s: BackendMeterStatus): Status => {
  switch (s) {
    case 'ok':
      return 'Active';
    case 'warning':
      return 'Active';
    case 'critical':
    case 'exhausted':
      return 'Exceeded';
  }
  const _exhaustive: never = s;
  return _exhaustive;
};

/**
 * Map a backend connection status (`connected` | `disconnected` | …) to vocab.
 */
export type BackendConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'neutral'
  | 'warning';
export const fromConnectionStatus = (s: BackendConnectionStatus): Status => {
  switch (s) {
    case 'connected':
      return 'Healthy';
    case 'connecting':
      return 'Refreshing';
    case 'disconnected':
      return 'Disabled';
    case 'error':
      return 'Error';
    case 'warning':
      return 'Degraded';
    case 'neutral':
      return 'Idle';
  }
  const _exhaustive: never = s;
  return _exhaustive;
};
