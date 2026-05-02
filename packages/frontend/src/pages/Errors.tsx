import React, { useEffect, useState } from 'react';
import { api, InferenceError } from '../lib/api';
import Editor from '@monaco-editor/react';
import {
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
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
import { PageHeader } from '../components/layout/PageHeader';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/cn';

export const Errors: React.FC = () => {
  const location = useLocation();
  const { isAdmin, principal } = useAuth();
  const [errors, setErrors] = useState<InferenceError[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<InferenceError | null>(null);
  const [loading, setLoading] = useState(false);

  // Delete Modal State
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [selectedRequestIdForDelete, setSelectedRequestIdForDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (location.state?.requestId) {
      setSelectedId(location.state.requestId);
    }
  }, [location.state]);

  const fetchErrors = async () => {
    setLoading(true);
    try {
      const data = await api.getErrors(50);
      setErrors(data);
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
      await api.deleteAllErrors();
      await fetchErrors();
      setSelectedId(null);
      setSelectedError(null);
      setIsDeleteAllModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    setSelectedRequestIdForDelete(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingle = async () => {
    if (!selectedRequestIdForDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteError(selectedRequestIdForDelete);
      setErrors(errors.filter((e) => e.requestId !== selectedRequestIdForDelete));
      if (selectedId === selectedRequestIdForDelete) {
        setSelectedId(null);
        setSelectedError(null);
      }
      setIsSingleDeleteModalOpen(false);
      setSelectedRequestIdForDelete(null);
    } catch (e) {
      console.error('Failed to delete error log', e);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedId) {
      const found = errors.find((e) => e.requestId === selectedId);
      if (found) {
        setSelectedError(found);
      } else {
        // If not in current list, maybe fetch specific?
        // For now, assuming it's in the list or will appear on refresh
      }
    } else {
      setSelectedError(null);
    }
  }, [selectedId, errors]);

  const formatContent = (content: any) => {
    if (!content) return '';
    if (typeof content === 'string') {
      try {
        // Check if it looks like JSON
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
          return JSON.stringify(JSON.parse(content), null, 2);
        }
        return content;
      } catch {
        return content;
      }
    }
    return JSON.stringify(content, null, 2);
  };

  const parseDetails = (details: any) => {
    if (!details) return null;
    if (typeof details === 'string') {
      try {
        return JSON.parse(details);
      } catch {
        return { raw: details };
      }
    }
    return details;
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      <div className="px-6 pt-6 pb-3 shrink-0 lg:px-8 lg:pt-8">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2 text-danger">
              <AlertTriangle size={24} />
              Inference Errors
            </span>
          }
          subtitle={
            principal?.role === 'limited' && principal.keyName
              ? `Errors for key "${principal.keyName}" only.`
              : 'Investigate failed requests and exceptions.'
          }
          actions={
            <>
              {isAdmin && (
                <Button
                  onClick={handleDeleteAll}
                  variant="destructive"
                  size="sm"
                  disabled={errors.length === 0}
                >
                  <Trash2 strokeWidth={1.75} />
                  Delete All
                </Button>
              )}
              <Button onClick={fetchErrors} variant="outline" size="sm">
                <RefreshCw className={loading ? 'animate-spin' : undefined} strokeWidth={1.75} />
                Refresh
              </Button>
            </>
          }
        />
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden border-t border-border">
        {/* Left Pane: Error List */}
        <div className="flex w-full max-h-[40vh] shrink-0 flex-col border-b border-border bg-surface md:max-h-none md:w-[320px] md:border-b-0 md:border-r">
          <div className="border-b border-border p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
              Recent Errors
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            {errors.map((err) => (
              <div
                key={err.id}
                onClick={() => setSelectedId(err.requestId)}
                className={cn(
                  'group cursor-pointer rounded-md border border-transparent p-3 transition-colors hover:bg-surface-elevated',
                  selectedId === err.requestId && 'border-border bg-surface-elevated'
                )}
              >
                <div className="w-full">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="size-3.5 text-foreground-subtle" strokeWidth={1.75} />
                      <span className="font-mono text-xs text-foreground-muted">
                        {new Date(err.date).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, err.requestId)}
                      className="rounded p-1 text-foreground-subtle opacity-0 transition-all hover:bg-danger-subtle hover:text-danger group-hover:opacity-100"
                      aria-label="Delete error log"
                    >
                      <Trash2 className="size-3" strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-foreground-subtle">
                    {err.requestId?.substring(0, 8) ?? '-'}…
                  </div>
                  <div className="mt-1 truncate text-sm text-danger" title={err.errorMessage}>
                    {err.errorMessage}
                  </div>
                </div>
              </div>
            ))}
            {errors.length === 0 && (
              <div className="p-8 text-center text-sm italic text-foreground-subtle">
                No errors found.
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Details */}
        <div className="relative flex flex-1 flex-col overflow-y-auto bg-background">
          {selectedId && selectedError ? (
            <div className="flex flex-col">
              <div className="mb-4 border-b border-border p-4">
                <h3 className="mb-2 text-lg font-semibold text-danger">Error details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-foreground-muted">Request ID:</span>
                    <span className="ml-2 font-mono text-foreground">
                      {selectedError.requestId}
                    </span>
                  </div>
                  <div>
                    <span className="text-foreground-muted">Time:</span>
                    <span className="ml-2 text-foreground">
                      {new Date(selectedError.date).toLocaleString()}
                    </span>
                  </div>
                </div>
                {(() => {
                  const details = parseDetails(selectedError.details);
                  if (details && (details.provider || details.targetModel || details.url)) {
                    return (
                      <div className="mt-4 border-t border-border pt-4">
                        <h4 className="mb-2 text-sm font-semibold text-warning">
                          Routing information
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {details.provider && (
                            <div>
                              <span className="text-foreground-muted">Provider:</span>
                              <span className="ml-2 font-mono text-info">{details.provider}</span>
                            </div>
                          )}
                          {details.targetModel && (
                            <div>
                              <span className="text-foreground-muted">Target model:</span>
                              <span className="ml-2 font-mono text-info">
                                {details.targetModel}
                              </span>
                            </div>
                          )}
                          {details.targetApiType && (
                            <div>
                              <span className="text-foreground-muted">Target API:</span>
                              <span className="ml-2 font-mono text-info">
                                {details.targetApiType}
                              </span>
                            </div>
                          )}
                          {details.statusCode && (
                            <div>
                              <span className="text-foreground-muted">Status code:</span>
                              <span className="ml-2 font-mono text-danger">
                                {details.statusCode}
                              </span>
                            </div>
                          )}
                          {details.url && (
                            <div className="col-span-2">
                              <span className="text-foreground-muted">Request URL:</span>
                              <div className="ml-2 mt-1 break-all font-mono text-xs text-info">
                                {details.url}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <AccordionPanel
                title="Message"
                content={selectedError.errorMessage}
                color="text-danger"
                defaultOpen={true}
                language="plaintext"
              />
              <AccordionPanel
                title="Stack Trace"
                content={selectedError.errorStack || '(No stack trace available)'}
                color="text-warning"
                defaultOpen={true}
                language="plaintext"
              />
              {(() => {
                const details = parseDetails(selectedError.details);
                if (details?.providerResponse) {
                  return (
                    <AccordionPanel
                      title="Provider Response"
                      content={details.providerResponse}
                      color="text-foreground-muted"
                      defaultOpen={false}
                      language="plaintext"
                    />
                  );
                }
                return null;
              })()}
              {(() => {
                const details = parseDetails(selectedError.details);
                if (details?.headers) {
                  return (
                    <AccordionPanel
                      title="Request Headers"
                      content={formatContent(details.headers)}
                      color="text-info"
                      defaultOpen={false}
                    />
                  );
                }
                return null;
              })()}
              {selectedError.details &&
                (() => {
                  const details = parseDetails(selectedError.details);
                  const displayedFields = [
                    'provider',
                    'targetModel',
                    'targetApiType',
                    'url',
                    'statusCode',
                    'providerResponse',
                    'headers',
                  ];
                  const hasOtherFields =
                    details && Object.keys(details).some((key) => !displayedFields.includes(key));

                  if (hasOtherFields) {
                    return (
                      <AccordionPanel
                        title="Additional details"
                        content={formatContent(details)}
                        color="text-info"
                        defaultOpen={false}
                      />
                    );
                  }
                  return null;
                })()}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-foreground-subtle">
              <AlertTriangle className="size-12 opacity-20" strokeWidth={1.5} />
              <p>Select an error to inspect details</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={isDeleteAllModalOpen} onOpenChange={setIsDeleteAllModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all errors?</AlertDialogTitle>
            <AlertDialogDescription>
              All inference error records will be removed. This cannot be undone.
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
            <AlertDialogTitle>Delete error log?</AlertDialogTitle>
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
  language?: string;
}> = ({ title, content, color, defaultOpen = false, language = 'json' }) => {
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
            defaultLanguage={language}
            theme={themeMode === 'light' ? 'vs' : 'vs-dark'}
            value={content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: 'Geist Mono, "Fira Code", monospace',
              lineNumbers: 'off',
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
