import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import Editor from '@monaco-editor/react';
import {
  RefreshCw,
  Clock,
  Database,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  Download,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '../components/ui-v2/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui-v2/alert-dialog';
import { Pill } from '../components/chips/Pill';
import { PageHeader } from '../components/layout/PageHeader';
import { useLocation } from 'react-router-dom';
import type { Provider } from '../lib/api';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/cn';

interface DebugLogMeta {
  requestId: string;
  createdAt: number;
}

interface DebugLogDetail extends DebugLogMeta {
  rawRequest: string | object;
  transformedRequest: string | object;
  rawResponse: string | object;
  transformedResponse: string | object;
  rawResponseSnapshot?: string | object;
  transformedResponseSnapshot?: string | object;
}

export const Debug: React.FC = () => {
  const location = useLocation();
  const { isAdmin, principal } = useAuth();
  const [logs, setLogs] = useState<DebugLogMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebugLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Provider filter state
  const [providers, setProviders] = useState<Provider[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Delete Modal State
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [selectedLogIdForDelete, setSelectedLogIdForDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (location.state?.requestId) {
      setSelectedId(location.state.requestId);
      // clear state so it doesn't persist on refresh if we wanted, but standard behavior is fine
    }
  }, [location.state]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getDebugLogs(50);
      setLogs(data);
      if (data.length > 0 && !selectedId && !location.state?.requestId) {
        // Optionally select first? No, let user choose.
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = () => {
    setIsDeleteAllModalOpen(true);
  };

  const confirmDeleteAll = async () => {
    setIsDeleting(true);
    try {
      await api.deleteAllDebugLogs();
      await fetchLogs();
      setSelectedId(null);
      setDetail(null);
      setIsDeleteAllModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    setSelectedLogIdForDelete(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingle = async () => {
    if (!selectedLogIdForDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteDebugLog(selectedLogIdForDelete);
      setLogs(logs.filter((l) => l.requestId !== selectedLogIdForDelete));
      if (selectedId === selectedLogIdForDelete) {
        setSelectedId(null);
        setDetail(null);
      }
      setIsSingleDeleteModalOpen(false);
      setSelectedLogIdForDelete(null);
    } catch (e) {
      console.error('Failed to delete log', e);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // Auto-refresh list
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setLoadingDetail(true);
      api.getDebugLogDetail(selectedId).then((data) => {
        setDetail(data);
        setLoadingDetail(false);
      });
    } else {
      setDetail(null);
    }
  }, [selectedId]);

  useEffect(() => {
    setCopiedAll(false);
  }, [detail?.requestId]);

  // Fetch providers and debug status
  useEffect(() => {
    const fetchProvidersAndStatus = async () => {
      try {
        const [providersData, debugStatus] = await Promise.all([
          api.getProviders(),
          api.getDebugMode(),
        ]);
        setProviders(providersData);
        setDebugEnabled(debugStatus.enabled);
        setSelectedProviders(debugStatus.providers || []);
      } catch (e) {
        console.error('Failed to fetch providers or debug status', e);
      }
    };
    fetchProvidersAndStatus();
  }, []);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.provider-filter-dropdown')) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterOpen]);

  const handleProviderToggle = (providerId: string) => {
    setSelectedProviders((prev) => {
      const newSelection = prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId];
      return newSelection;
    });
  };

  const applyProviderFilter = async () => {
    try {
      await api.setDebugMode(debugEnabled, selectedProviders.length > 0 ? selectedProviders : null);
      setIsFilterOpen(false);
    } catch (e) {
      console.error('Failed to apply provider filter', e);
    }
  };

  const clearProviderFilter = async () => {
    setSelectedProviders([]);
    try {
      await api.setDebugMode(debugEnabled, null);
    } catch (e) {
      console.error('Failed to clear provider filter', e);
    }
  };

  const formatContent = (content: any) => {
    if (!content) return '';
    if (typeof content === 'string') {
      try {
        return JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        return content;
      }
    }
    return JSON.stringify(content, null, 2);
  };

  const normalizeExportContent = (content: string | object | null | undefined) => {
    if (content === undefined) return undefined;
    if (content === null) return null;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }
    return content;
  };

  const exportContent = useMemo(() => {
    if (!detail) return '';
    const payload = {
      requestId: detail.requestId,
      createdAt: detail.createdAt,
      rawRequest: normalizeExportContent(detail.rawRequest),
      transformedRequest: normalizeExportContent(detail.transformedRequest),
      rawResponse: normalizeExportContent(detail.rawResponse),
      rawResponseSnapshot: normalizeExportContent(detail.rawResponseSnapshot),
      transformedResponse: normalizeExportContent(detail.transformedResponse),
      transformedResponseSnapshot: normalizeExportContent(detail.transformedResponseSnapshot),
    };
    return JSON.stringify(payload, null, 2);
  }, [detail]);

  const handleCopyAll = async () => {
    if (!exportContent || !isClipboardAvailable()) return;
    const success = await copyToClipboard(exportContent);
    if (success) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleDownloadAll = () => {
    if (!detail || !exportContent) return;
    const blob = new Blob([exportContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date(detail.createdAt).toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `debug-trace-${detail.requestId}-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      <div className="px-6 pt-6 pb-3 shrink-0 lg:px-8 lg:pt-8">
        <PageHeader
          title="Debug Traces"
          subtitle={
            principal?.role === 'limited' && principal.keyName
              ? `Traces for key "${principal.keyName}" only. Toggle capture in My Key.`
              : 'Inspect full request/response lifecycles.'
          }
          actions={
            <>
              {/* Provider Filter — admin-only: the global filter affects all users. */}
              {isAdmin && (
                <div className="relative provider-filter-dropdown">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(selectedProviders.length > 0 && 'border-accent')}
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                  >
                    <Filter strokeWidth={1.75} />
                    Filter
                    {selectedProviders.length > 0 && (
                      <Pill size="sm" tone="accent" className="ml-1">
                        {selectedProviders.length}
                      </Pill>
                    )}
                  </Button>

                  {isFilterOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-md">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Provider filter</span>
                        {selectedProviders.length > 0 && (
                          <button
                            onClick={clearProviderFilter}
                            className="flex items-center gap-1 text-xs text-foreground-muted transition-colors hover:text-foreground"
                          >
                            <X className="size-3" strokeWidth={2} />
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="mb-3 text-xs text-foreground-muted">
                        Only log requests for selected providers.
                      </p>
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {providers.map((provider) => (
                          <label
                            key={provider.id}
                            className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-surface-elevated"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProviders.includes(provider.id)}
                              onChange={() => handleProviderToggle(provider.id)}
                              className="rounded border-border text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-foreground">
                              {provider.name || provider.id}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 flex gap-2 border-t border-border pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setIsFilterOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" className="flex-1" onClick={applyProviderFilter}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detail && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCopyAll}>
                    {copiedAll ? (
                      <Check className="text-success" strokeWidth={2} />
                    ) : (
                      <Copy strokeWidth={1.75} />
                    )}
                    {copiedAll ? 'Copied' : 'Copy all'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                    <Download strokeWidth={1.75} />
                    Download
                  </Button>
                </>
              )}
              {isAdmin && (
                <Button
                  onClick={handleDeleteAll}
                  variant="destructive"
                  size="sm"
                  disabled={logs.length === 0}
                >
                  <Trash2 strokeWidth={1.75} />
                  Delete all
                </Button>
              )}
              <Button onClick={fetchLogs} variant="outline" size="sm">
                <RefreshCw className={loading ? 'animate-spin' : undefined} strokeWidth={1.75} />
                Refresh
              </Button>
            </>
          }
        />
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden border-t border-border">
        {/* Left Pane: Request List */}
        <div className="w-full md:w-[320px] border-b md:border-b-0 md:border-r border-border bg-surface flex flex-col shrink-0 max-h-[40vh] md:max-h-none">
          <div className="p-4 border-b border-border">
            <span className="text-xs font-bold text-foreground-muted uppercase tracking-wider">
              Recent Requests
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {logs.map((log) => (
              <div
                key={log.requestId}
                onClick={() => setSelectedId(log.requestId)}
                className={cn(
                  'group cursor-pointer rounded-md border border-transparent p-3 transition-colors hover:bg-surface-elevated',
                  selectedId === log.requestId && 'border-border bg-surface-elevated'
                )}
              >
                <div className="w-full">
                  <div className="flex items-center gap-2 mb-1 justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-[var(--foreground-muted)]" />
                      <span className="text-xs font-mono text-foreground-muted">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, log.requestId)}
                      className="bg-transparent border-0 text-foreground-muted p-1 rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-red-600/10 hover:text-danger group-hover:opacity-100 opacity-0 transition-opacity"
                      title="Delete log"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="text-[13px] font-mono text-accent whitespace-nowrap overflow-hidden text-ellipsis mt-1">
                    {log.requestId?.substring(0, 8) ?? '-'}...
                  </div>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-center p-8 text-[var(--foreground-muted)] italic text-sm">
                No debug logs found. Ensure Debug Mode is enabled.
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Details */}
        <div className="flex-1 bg-background overflow-y-auto flex flex-col relative">
          {selectedId && detail ? (
            <div className="flex flex-col">
              <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                    Selected Trace
                  </span>
                  <span className="text-xs font-mono text-foreground-muted">
                    {detail.requestId}
                  </span>
                </div>
              </div>
              <AccordionPanel
                title="Raw Request"
                content={formatContent(detail.rawRequest)}
                color="text-blue-400"
                defaultOpen={true}
              />
              <AccordionPanel
                title="Transformed Request"
                content={formatContent(detail.transformedRequest)}
                color="text-purple-400"
              />
              <AccordionPanel
                title="Raw Response"
                content={formatContent(detail.rawResponse)}
                color="text-orange-400"
              />
              {detail.rawResponseSnapshot && (
                <AccordionPanel
                  title="Raw Response (Reconstructed)"
                  content={formatContent(detail.rawResponseSnapshot)}
                  color="text-orange-400"
                />
              )}
              <AccordionPanel
                title="Transformed Response"
                content={formatContent(detail.transformedResponse)}
                color="text-green-400"
                defaultOpen={true}
              />
              {detail.transformedResponseSnapshot && (
                <AccordionPanel
                  title="Transformed Response (Reconstructed)"
                  content={formatContent(detail.transformedResponseSnapshot)}
                  color="text-green-400"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-foreground-muted gap-4">
              <Database size={48} opacity={0.2} />
              <p>Select a request trace to inspect details</p>
            </div>
          )}

          {loadingDetail && (
            <div className="absolute inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-sm flex items-center justify-center z-10">
              <RefreshCw className="animate-spin text-[var(--color-primary)]" size={32} />
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={isDeleteAllModalOpen} onOpenChange={setIsDeleteAllModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all debug logs?</AlertDialogTitle>
            <AlertDialogDescription>
              All captured request/response payloads will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAll}
              disabled={isDeleting}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete all'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isSingleDeleteModalOpen} onOpenChange={setIsSingleDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete debug log?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSingle}
              disabled={isDeleting}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const AccordionPanel: React.FC<{
  title: string;
  content: string;
  color: string;
  defaultOpen?: boolean;
}> = ({ title, content, color, defaultOpen = false }) => {
  const { resolved: themeMode } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isClipboardAvailable()) return;
    const success = await copyToClipboard(content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-b border-border bg-surface">
      <div
        className="flex cursor-pointer select-none items-center justify-between bg-surface-elevated px-4 py-3 transition-colors hover:bg-surface"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="size-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="size-4" strokeWidth={1.75} />
          )}
          <span className={cn('text-[11px] font-medium uppercase tracking-wider', color)}>
            {title}
          </span>
        </div>
        <button
          className="rounded p-1 text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
          onClick={handleCopy}
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <Check className="size-3.5 text-success" strokeWidth={2} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>
      <div
        className={cn(
          'overflow-hidden transition-[max-height] duration-200 ease-out',
          isOpen ? 'max-h-[500px]' : 'max-h-0'
        )}
      >
        <div className="h-[400px] bg-surface-sunken">
          <Editor
            height="100%"
            defaultLanguage="json"
            theme={themeMode === 'light' ? 'vs' : 'vs-dark'}
            value={content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: 'Geist Mono, "Fira Code", monospace',
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              padding: { top: 10, bottom: 10 },
            }}
          />
        </div>
      </div>
    </div>
  );
};
