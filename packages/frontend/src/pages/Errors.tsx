import React, { useEffect, useState } from 'react';
import { InferenceError } from '../lib/api';
import { useErrors, useDeleteError, useDeleteAllErrors } from '../hooks/queries/useErrors';
import Editor from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
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
import { clsx } from 'clsx';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/layout/PageHeader';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const Errors: React.FC = () => {
  const location = useLocation();
  const { isAdmin, principal } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<InferenceError | null>(null);

  // Delete Modal State
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [selectedRequestIdForDelete, setSelectedRequestIdForDelete] = useState<string | null>(null);

  const errorsQuery = useErrors({ refetchInterval: 10_000 });
  const deleteErrorMutation = useDeleteError();
  const deleteAllErrorsMutation = useDeleteAllErrors();

  const errors: InferenceError[] = errorsQuery.data ?? [];
  const loading = errorsQuery.isLoading || errorsQuery.isFetching;
  const isDeleting = deleteErrorMutation.isPending || deleteAllErrorsMutation.isPending;

  useEffect(() => {
    if (location.state?.requestId) {
      setSelectedId(location.state.requestId);
    }
  }, [location.state]);

  const handleDeleteAll = () => {
    setIsDeleteAllModalOpen(true);
  };

  const confirmDeleteAll = () => {
    deleteAllErrorsMutation.mutate(undefined, {
      onSuccess: () => {
        setSelectedId(null);
        setSelectedError(null);
        setIsDeleteAllModalOpen(false);
      },
    });
  };

  const handleDelete = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    setSelectedRequestIdForDelete(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingle = () => {
    if (!selectedRequestIdForDelete) return;
    deleteErrorMutation.mutate(selectedRequestIdForDelete, {
      onSuccess: () => {
        if (selectedId === selectedRequestIdForDelete) {
          setSelectedId(null);
          setSelectedError(null);
        }
        setIsSingleDeleteModalOpen(false);
        setSelectedRequestIdForDelete(null);
      },
    });
  };

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
      <div className="shrink-0">
        <PageHeader
          title="Errors"
          subtitle={
            principal?.role === 'limited' && principal.keyName
              ? `Errors for key "${principal.keyName}" only`
              : 'Grouped by signature · last 24h'
          }
          actions={
            <>
              {isAdmin && (
                <Button
                  onClick={handleDeleteAll}
                  variant="danger"
                  size="md"
                  leftIcon={<Trash2 size={14} />}
                  disabled={errors.length === 0}
                >
                  Delete All
                </Button>
              )}
              <Button
                onClick={() => errorsQuery.refetch()}
                variant="secondary"
                size="md"
                leftIcon={<RefreshCw size={14} className={clsx(loading && 'animate-spin')} />}
              >
                Refresh
              </Button>
            </>
          }
        />
      </div>

      <div className="mt-3 sm:mt-2 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border md:flex-row">
        {/* Left Pane: Error List */}
        <div className="flex max-h-[34vh] w-full shrink-0 flex-col border-b border-border bg-surface md:max-h-none md:w-[320px] md:border-b-0 md:border-r">
          <div className="border-b border-border p-3 sm:p-4">
            <span className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
              Recent Errors
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {errors.map((err) => (
              <div
                key={err.id}
                onClick={() => setSelectedId(err.requestId)}
                className={clsx(
                  'p-3 rounded-md cursor-pointer transition-all duration-200 border border-transparent hover:bg-surface-elevated group',
                  selectedId === err.requestId && 'bg-surface border-border shadow-sm'
                )}
              >
                <div className="w-full">
                  <div className="flex items-center gap-2 mb-1 justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-foreground-subtle" />
                      <span className="text-xs font-mono text-foreground-subtle">
                        {new Date(err.date).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, err.requestId)}
                      className="bg-transparent border-0 text-foreground-subtle p-1 rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-danger-subtle hover:text-danger opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      title="Delete error log"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="text-[13px] font-mono text-accent whitespace-nowrap overflow-hidden text-ellipsis mt-1 font-mono text-xs text-foreground-subtle">
                    {err.requestId?.substring(0, 8) ?? '-'}...
                  </div>
                  <div className="mt-1 text-sm text-danger truncate" title={err.errorMessage}>
                    {err.errorMessage}
                  </div>
                </div>
              </div>
            ))}
            {errors.length === 0 && (
              <EmptyState
                variant="dense"
                icon={<AlertTriangle />}
                title="No errors yet"
                description="Failed requests will appear here."
              />
            )}
          </div>
        </div>

        {/* Right Pane: Details */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
          {selectedId && selectedError ? (
            <div className="flex flex-col">
              <div className="mb-3 border-b border-border p-3 sm:mb-4 sm:p-4">
                <h3 className="mb-2 text-base font-semibold text-danger sm:text-lg">
                  Error Details
                </h3>
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 sm:gap-4 sm:text-sm">
                  <div className="min-w-0">
                    <span className="text-foreground-subtle">Request ID:</span>
                    <span className="ml-2 break-all font-mono">{selectedError.requestId}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground-subtle">Time:</span>
                    <span className="ml-2">{new Date(selectedError.date).toLocaleString()}</span>
                  </div>
                </div>
                {(() => {
                  const details = parseDetails(selectedError.details);
                  if (details && (details.provider || details.targetModel || details.url)) {
                    return (
                      <div className="mt-4 pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold text-yellow-500 mb-2">
                          Routing Information
                        </h4>
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 sm:gap-4 sm:text-sm">
                          {details.provider && (
                            <div className="min-w-0">
                              <span className="text-foreground-subtle">Provider:</span>
                              <span className="ml-2 break-all font-mono text-blue-400">
                                {details.provider}
                              </span>
                            </div>
                          )}
                          {details.targetModel && (
                            <div className="min-w-0">
                              <span className="text-foreground-subtle">Target Model:</span>
                              <span className="ml-2 break-all font-mono text-blue-400">
                                {details.targetModel}
                              </span>
                            </div>
                          )}
                          {details.targetApiType && (
                            <div className="min-w-0">
                              <span className="text-foreground-subtle">Target API:</span>
                              <span className="ml-2 break-all font-mono text-blue-400">
                                {details.targetApiType}
                              </span>
                            </div>
                          )}
                          {details.statusCode && (
                            <div className="min-w-0">
                              <span className="text-foreground-subtle">Status Code:</span>
                              <span className="ml-2 font-mono text-danger">
                                {details.statusCode}
                              </span>
                            </div>
                          )}
                          {details.url && (
                            <div className="sm:col-span-2">
                              <span className="text-foreground-subtle">Request URL:</span>
                              <div className="ml-2 font-mono text-xs text-blue-400 break-all mt-1">
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

              {/* Intentional fixed per-panel visual encoding — raw palette colors are correct here,
                  NOT semantic tokens (Message uses the semantic danger token since it maps to
                  the same hue). Each accordion section (message/stack/response) has a stable
                  identity color for quick visual scanning. Do not migrate the remaining raw
                  colors to theme tokens. */}
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
                color="text-orange-400"
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
                      color="text-purple-400"
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
                      color="text-info-400"
                      defaultOpen={false}
                    />
                  );
                }
                return null;
              })()}
              {selectedError.details &&
                (() => {
                  const details = parseDetails(selectedError.details);
                  // Show full details if there are fields we haven't displayed elsewhere
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
                        title="Additional Details"
                        content={formatContent(details)}
                        color="text-blue-400"
                        defaultOpen={false}
                      />
                    );
                  }
                  return null;
                })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-foreground-subtle gap-4">
              <AlertTriangle size={48} opacity={0.2} />
              <p>Select an error to inspect details</p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDeleteAllModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteAll} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete All Errors'}
            </Button>
          </>
        }
      >
        <p>Are you sure you want to delete ALL error logs? This action cannot be undone.</p>
      </Modal>

      <Modal
        isOpen={isSingleDeleteModalOpen}
        onClose={() => setIsSingleDeleteModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsSingleDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteSingle} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Error Log'}
            </Button>
          </>
        }
      >
        <p>Are you sure you want to delete this error log? This action cannot be undone.</p>
      </Modal>
    </div>
  );
};

const EDITOR_MIN_HEIGHT = 60;
const EDITOR_MAX_HEIGHT = 600;

const AccordionPanel: React.FC<{
  title: string;
  content: unknown;
  color: string;
  defaultOpen?: boolean;
  language?: string;
}> = ({ title, content, color, defaultOpen = false, language = 'json' }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [editorHeight, setEditorHeight] = useState(EDITOR_MIN_HEIGHT);
  const { resolved } = useTheme();

  const editorContent = (() => {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  })();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isClipboardAvailable()) return;
    const success = await copyToClipboard(editorContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-b border-border bg-surface">
      <div
        className="flex cursor-pointer select-none items-center justify-between bg-surface-elevated px-3 py-2.5 transition-colors duration-200 hover:bg-surface sm:px-4 sm:py-3"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className={clsx('text-[11px] font-bold uppercase tracking-wider', color)}>
            {title}
          </span>
        </div>
        <button
          className="bg-transparent border-0 text-foreground-subtle p-1 rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-white/10 hover:text-foreground"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isOpen ? editorHeight : 0 }}
      >
        <div className="bg-surface-sunken" style={{ height: editorHeight }}>
          <Editor
            height="100%"
            defaultLanguage={language}
            theme={resolved === 'light' ? 'vs' : 'vs-dark'}
            value={editorContent}
            onMount={(editor) => {
              const updateHeight = () => {
                const contentHeight = editor.getContentHeight();
                setEditorHeight(
                  Math.min(Math.max(contentHeight, EDITOR_MIN_HEIGHT), EDITOR_MAX_HEIGHT)
                );
              };
              updateHeight();
              editor.onDidContentSizeChange(updateHeight);
            }}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
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
