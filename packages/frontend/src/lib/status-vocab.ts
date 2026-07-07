/**
 * Status vocabulary translation.
 *
 * The backend returns its own status literals (per-resource); this module
 * fixes a single vocabulary (`Status`) the UI uses everywhere, maps each
 * value to a display tone (`statusTone`), and translates backend connection
 * statuses into that vocabulary (`fromConnectionStatus`). Keep it
 * exhaustive — TypeScript catches drift.
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
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
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
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
};
