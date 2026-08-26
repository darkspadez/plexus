import { useCallback, useEffect, useState } from 'react';
import {
  getAnomalyPolicySnapshot,
  getKeyAnomalyPolicy,
  getKeySecurityEvents,
  saveGlobalAnomalyPolicy,
  saveKeyAnomalyPolicy,
  transitionKey,
  type AnomalyPolicySnapshot,
  type GlobalAnomalyPolicy,
  type KeyPolicyPreview,
  type KeySecurityEvent,
  type PerKeyAnomalyPolicy,
} from '../../lib/api/keySecurity';
import type { KeyConfig } from '../../lib/api/keys';

const PAGE_SIZE = 5;

interface UseKeySecurityOptions {
  readonly refreshKeys: () => Promise<unknown>;
}

const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export const useKeySecurity = ({ refreshKeys }: UseKeySecurityOptions) => {
  const [snapshot, setSnapshot] = useState<AnomalyPolicySnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeyConfig | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<KeyPolicyPreview | null>(null);
  const [events, setEvents] = useState<readonly KeySecurityEvent[]>([]);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsHaveMore, setEventsHaveMore] = useState(false);
  const [wouldPauseEvents, setWouldPauseEvents] = useState<readonly KeySecurityEvent[]>([]);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const next = await getAnomalyPolicySnapshot();
      setSnapshot(next);
      setSnapshotError(null);
      return next;
    } catch (error) {
      setSnapshotError(messageFrom(error, 'Failed to load security policy'));
      return null;
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const loadEvents = async (keyName: string, offset: number) => {
    setIsLoadingEvents(true);
    try {
      const page = await getKeySecurityEvents(keyName, PAGE_SIZE, offset);
      setEvents(page.events);
      setEventOffset(offset);
      setEventsHaveMore(page.events.length === PAGE_SIZE);
      setKeyError(null);
    } catch (error) {
      setKeyError(messageFrom(error, 'Failed to load security history'));
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const openKey = async (key: KeyConfig) => {
    setSelectedKey(key);
    setSelectedPreview(null);
    setKeyError(null);
    setIsLoadingKey(true);
    try {
      const [preview] = await Promise.all([getKeyAnomalyPolicy(key.key), loadEvents(key.key, 0)]);
      setSelectedPreview(preview);
    } catch (error) {
      setKeyError(messageFrom(error, 'Failed to load key security settings'));
    } finally {
      setIsLoadingKey(false);
    }
  };

  const saveGlobal = async (policy: GlobalAnomalyPolicy) => {
    setIsSavingGlobal(true);
    setSnapshotError(null);
    try {
      await saveGlobalAnomalyPolicy(policy);
      await loadSnapshot();
    } catch (error) {
      setSnapshotError(messageFrom(error, 'Failed to save security policy'));
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const saveKeyPolicy = async (policy: PerKeyAnomalyPolicy) => {
    if (!selectedKey) return;
    setIsSavingKey(true);
    setKeyError(null);
    try {
      const preview = await saveKeyAnomalyPolicy(selectedKey.key, policy);
      setSelectedPreview(preview);
      await loadSnapshot();
    } catch (error) {
      setKeyError(messageFrom(error, 'Failed to save key security policy'));
    } finally {
      setIsSavingKey(false);
    }
  };

  const transition = async (action: 'pause' | 'resume', reason: string) => {
    if (!selectedKey) return false;
    setIsTransitioning(true);
    setKeyError(null);
    try {
      const response = await transitionKey(selectedKey.key, action, reason);
      setSelectedKey((current) => {
        if (!current) return current;
        if (action === 'pause' && response.key.pausedAt !== undefined) {
          return {
            ...current,
            pausedAt: response.key.pausedAt,
            pauseSource: 'manual',
            pauseReason: reason,
          };
        }
        const {
          pausedAt: _pausedAt,
          pauseSource: _pauseSource,
          pauseReason: _pauseReason,
          ...rest
        } = current;
        return rest;
      });
      await Promise.all([refreshKeys(), loadSnapshot(), loadEvents(selectedKey.key, 0)]);
      return true;
    } catch (error) {
      setKeyError(messageFrom(error, `Failed to ${action} key`));
      return false;
    } finally {
      setIsTransitioning(false);
    }
  };

  const loadEvidence = useCallback(async (keyNames: readonly string[]) => {
    setIsLoadingEvidence(true);
    try {
      const pages = await Promise.all(keyNames.map((name) => getKeySecurityEvents(name, 20, 0)));
      setWouldPauseEvents(
        pages
          .flatMap((page) => page.events)
          .filter((event) => event.eventKind === 'would_pause')
          .sort((left, right) => right.createdAt - left.createdAt)
      );
    } catch (error) {
      setSnapshotError(messageFrom(error, 'Failed to load observe-mode evidence'));
    } finally {
      setIsLoadingEvidence(false);
    }
  }, []);

  return {
    snapshot,
    snapshotError,
    selectedKey,
    selectedPreview,
    events,
    eventOffset,
    pageSize: PAGE_SIZE,
    eventsHaveMore,
    wouldPauseEvents,
    isLoadingKey,
    isLoadingEvents,
    isLoadingEvidence,
    isSavingGlobal,
    isSavingKey,
    isTransitioning,
    keyError,
    openKey,
    closeKey: () => setSelectedKey(null),
    loadEvents: (offset: number) => selectedKey && void loadEvents(selectedKey.key, offset),
    loadEvidence,
    saveGlobal,
    saveKeyPolicy,
    transition,
  };
};
