import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DebugManager } from '../debug-manager';
import { runInRequestContext } from '../request-context';
import type { UsageStorageService } from '../usage-storage';

describe('DebugManager target capture', () => {
  let debugManager: DebugManager;
  let saveDebugLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    debugManager = DebugManager.getInstance();
    debugManager.resetForTesting();
    debugManager.setEnabled(false);
    saveDebugLog = vi.fn();
    debugManager.setStorage({ saveDebugLog } as unknown as UsageStorageService);
  });

  test('persists when the request key is enabled', () => {
    debugManager.enableForKey('test-key');

    runInRequestContext({ keyName: 'test-key' }, () => {
      debugManager.startLog('req-key', { model: 'untracked-alias' });
      debugManager.flush('req-key');
    });

    expect(saveDebugLog).toHaveBeenCalledTimes(1);
    expect(saveDebugLog.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'req-key',
      apiKey: 'test-key',
      modelAlias: 'untracked-alias',
    });
  });

  test('persists when the incoming alias is enabled', () => {
    debugManager.enableForAlias('tracked-alias');

    debugManager.startLog('req-alias', { model: 'tracked-alias' });
    debugManager.flush('req-alias');

    expect(saveDebugLog).toHaveBeenCalledTimes(1);
    expect(saveDebugLog.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'req-alias',
      modelAlias: 'tracked-alias',
    });
  });

  test('persists when routing resolves an alternate alias to an enabled canonical alias', () => {
    debugManager.enableForAlias('canonical-alias');

    debugManager.startLog('req-canonical-alias', { model: 'alternate-alias' });
    debugManager.setModelAliasForRequest('req-canonical-alias', 'canonical-alias');
    debugManager.flush('req-canonical-alias');

    expect(saveDebugLog).toHaveBeenCalledTimes(1);
    expect(saveDebugLog.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'req-canonical-alias',
      modelAlias: 'canonical-alias',
    });
  });

  test('persists when the selected provider is enabled', () => {
    debugManager.setEnabledProviders(['tracked-provider']);

    debugManager.startLog('req-provider', { model: 'untracked-alias' });
    debugManager.setProviderForRequest('req-provider', 'tracked-provider');
    debugManager.flush('req-provider');

    expect(saveDebugLog).toHaveBeenCalledTimes(1);
    expect(saveDebugLog.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'req-provider',
      provider: 'tracked-provider',
    });
  });

  test('global capture persists regardless of unmatched provider target', () => {
    debugManager.setEnabled(true);
    debugManager.setEnabledProviders(['other-provider']);

    debugManager.startLog('req-global', { model: 'untracked-alias' });
    debugManager.setProviderForRequest('req-global', 'untracked-provider');
    debugManager.flush('req-global');

    expect(saveDebugLog).toHaveBeenCalledTimes(1);
    expect(saveDebugLog.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'req-global',
      provider: 'untracked-provider',
    });
  });

  test('drops traces when no enabled dimension matches', () => {
    debugManager.setEnabledProviders(['tracked-provider']);
    debugManager.setEnabledAliases(['tracked-alias']);
    debugManager.setEnabledKeys(['tracked-key']);

    runInRequestContext({ keyName: 'other-key' }, () => {
      debugManager.startLog('req-drop', { model: 'other-alias' });
      debugManager.setProviderForRequest('req-drop', 'other-provider');
      debugManager.flush('req-drop');
    });

    expect(saveDebugLog).not.toHaveBeenCalled();
  });
});
