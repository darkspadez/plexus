import { UsageStorageService } from './usage-storage';
import { logger } from '../utils/logger';
import { createParser, EventSourceMessage } from 'eventsource-parser';
import { encode } from 'eventsource-encoder';

export interface DebugLogRecord {
  requestId: string;
  rawRequest?: any;
  transformedRequest?: any;
  rawResponse?: any;
  transformedResponse?: any;
  rawResponseSnapshot?: any;
  transformedResponseSnapshot?: any;
  provider?: string;
  createdAt?: number;
  /** Internal flag: true when the entry was created by startLog() and should be persisted. */
  _debugIntent?: boolean;
}

export class DebugManager {
  private static instance: DebugManager;
  private storage: UsageStorageService | null = null;
  private enabled: boolean = false;
  private providerFilter: string[] | null = null;
  private pendingLogs: Map<string, DebugLogRecord> = new Map();
  private ephemeralRequests: Set<string> = new Set();
  /** Per-API-key debug enable state (independent of global toggle). */
  private keyEnabled: Map<string, boolean> = new Map();

  private constructor() {}

  static getInstance(): DebugManager {
    if (!DebugManager.instance) {
      DebugManager.instance = new DebugManager();
    }
    return DebugManager.instance;
  }

  setStorage(storage: UsageStorageService) {
    this.storage = storage;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    logger.info(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Enable/disable debug tracing for a specific API key. */
  setKeyEnabled(keyName: string, enabled: boolean) {
    if (enabled) {
      this.keyEnabled.set(keyName, true);
    } else {
      this.keyEnabled.delete(keyName);
    }
    logger.info(`Debug mode for a key ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Check if debug is enabled for a specific key (global OR per-key). */
  isEnabledForKey(keyName: string): boolean {
    return this.enabled || this.keyEnabled.get(keyName) === true;
  }

  setProviderFilter(providers: string[] | null) {
    this.providerFilter = providers;
    logger.info(
      `Debug provider filter ${providers ? 'set to: ' + providers.join(', ') : 'cleared'}`
    );
  }

  getProviderFilter(): string[] | null {
    return this.providerFilter;
  }

  shouldLogProvider(provider: string): boolean {
    if (!this.providerFilter || this.providerFilter.length === 0) {
      return true; // No filter set, log all providers
    }
    return this.providerFilter.includes(provider);
  }

  setProviderForRequest(requestId: string, provider: string) {
    const log = this.pendingLogs.get(requestId);
    if (log) {
      log.provider = provider;
    }
  }

  startLog(requestId: string, rawRequest: any, keyName?: string) {
    // Log if global debug is on OR per-key debug is on for this key
    if (!this.enabled && !(keyName?.trim() && this.keyEnabled.get(keyName))) return;
    this.pendingLogs.set(requestId, {
      requestId,
      rawRequest,
      createdAt: Date.now(),
      _debugIntent: true,
    });

    // Auto-cleanup after 5 minutes to prevent memory leaks if streams hang or fail to flush
    setTimeout(
      () => {
        if (this.pendingLogs.has(requestId)) {
          logger.debug(`Auto-flushing stale debug log for ${requestId}`);
          this.flush(requestId);
        }
      },
      5 * 60 * 1000
    );
  }

  addTransformedRequest(requestId: string, payload: any) {
    if (!this.enabled && !this.pendingLogs.has(requestId)) return;
    let log = this.pendingLogs.get(requestId);
    if (!log) {
      // Create log entry if it doesn't exist (for ephemeral token estimation)
      log = {
        requestId,
        createdAt: Date.now(),
      };
      this.pendingLogs.set(requestId, log);
    }
    log.transformedRequest = payload;
  }

  addRawResponse(requestId: string, payload: any) {
    if (!this.enabled && !this.pendingLogs.has(requestId)) return;
    let log = this.pendingLogs.get(requestId);
    if (!log) {
      // Create log entry if it doesn't exist (for ephemeral token estimation)
      log = {
        requestId,
        createdAt: Date.now(),
      };
      this.pendingLogs.set(requestId, log);
    }
    log.rawResponse = payload;
  }

  addReconstructedRawResponse(requestId: string, payload: any) {
    // ALWAYS save to memory for usage extraction/estimation, regardless of debug mode
    // The 'enabled' flag only controls DB persistence via flush()
    let log = this.pendingLogs.get(requestId);
    if (!log) {
      log = {
        requestId,
        createdAt: Date.now(),
      };
      this.pendingLogs.set(requestId, log);
    }
    log.rawResponseSnapshot = payload;
  }

  addTransformedResponse(requestId: string, payload: any) {
    // Only save full response bodies if debug mode is enabled (for DB persistence)
    if (!this.enabled && !this.pendingLogs.has(requestId)) return;
    let log = this.pendingLogs.get(requestId);
    if (!log) {
      log = {
        requestId,
        createdAt: Date.now(),
      };
      this.pendingLogs.set(requestId, log);
    }
    log.transformedResponse = payload;
  }

  addTransformedResponseSnapshot(requestId: string, payload: any) {
    // ALWAYS save to memory for usage extraction/estimation
    let log = this.pendingLogs.get(requestId);
    if (!log) {
      log = {
        requestId,
        createdAt: Date.now(),
      };
      this.pendingLogs.set(requestId, log);
    }
    log.transformedResponseSnapshot = payload;
  }

  flush(requestId: string) {
    // Skip flushing ephemeral requests
    if (this.ephemeralRequests.has(requestId)) {
      logger.debug(`[DebugManager] Skipping flush for ephemeral request ${requestId}`);
      this.pendingLogs.delete(requestId);
      return;
    }

    const log = this.pendingLogs.get(requestId);
    if (!log) return;

    // Only persist entries that were intentionally started via startLog().
    // Other entries (e.g. from addReconstructedRawResponse) are for in-memory
    // usage extraction only and should not be written to the database.
    if (!log._debugIntent) {
      this.pendingLogs.delete(requestId);
      return;
    }

    if (!this.storage) return;

    // Check provider filter
    if (log.provider && !this.shouldLogProvider(log.provider)) {
      logger.debug(
        `[DebugManager] Skipping flush for ${requestId} - provider '${log.provider}' not in filter`
      );
      this.pendingLogs.delete(requestId);
      return;
    }

    logger.debug(`[DebugManager] Flushing debug log for ${requestId}`);
    if (typeof this.storage.saveDebugLog === 'function') {
      this.storage.saveDebugLog(log);
    }
    this.pendingLogs.delete(requestId);
  }

  /**
   * Mark a request as ephemeral (debug data won't be persisted)
   */
  markEphemeral(requestId: string): void {
    this.ephemeralRequests.add(requestId);
    logger.debug(`[DebugManager] Marked ${requestId} as ephemeral`);
  }

  /**
   * Check if a request is ephemeral
   */
  isEphemeral(requestId: string): boolean {
    return this.ephemeralRequests.has(requestId);
  }

  /**
   * Get reconstructed raw response for token estimation
   */
  getReconstructedRawResponse(requestId: string): any | null {
    const log = this.pendingLogs.get(requestId);
    return log?.rawResponseSnapshot || null;
  }

  /**
   * Discard ephemeral debug data without saving to database
   */
  discardEphemeral(requestId: string): void {
    if (this.ephemeralRequests.has(requestId)) {
      this.pendingLogs.delete(requestId);
      this.ephemeralRequests.delete(requestId);
      logger.debug(`[DebugManager] Discarded ephemeral data for ${requestId}`);
    }
  }
}
