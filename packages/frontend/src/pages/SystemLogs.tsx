import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Pause, Play, Trash2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui-v2/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui-v2/select';
import { Input } from '../components/ui-v2/input';
import { Pill } from '../components/chips/Pill';
import { ListPage } from '../components/templates';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: any;
}

const LEVEL_CLASS: Record<string, string> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-info',
  debug: 'text-foreground-muted',
  verbose: 'text-foreground-muted',
  silly: 'text-foreground-subtle',
};

export const SystemLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [currentLevel, setCurrentLevel] = useState('info');
  const [startupLevel, setStartupLevel] = useState('info');
  const [supportedLevels, setSupportedLevels] = useState<string[]>([
    'error',
    'warn',
    'info',
    'debug',
    'verbose',
    'silly',
  ]);
  const [selectedLevel, setSelectedLevel] = useState('info');
  const [isUpdatingLevel, setIsUpdatingLevel] = useState(false);
  const [moduleFilter, setModuleFilterState] = useState<string[]>([]);
  const [moduleInput, setModuleInput] = useState('');
  const isPausedRef = useRef(false);
  const { adminKey } = useAuth();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    api.getLoggingLevel().then((state) => {
      setCurrentLevel(state.level);
      setStartupLevel(state.startupLevel);
      setSupportedLevels(state.supportedLevels);
      setSelectedLevel(state.level);
    });
    api.getModuleFilter().then((state) => {
      setModuleFilterState(state.modules);
    });
  }, []);

  const disconnect = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const connect = async () => {
    disconnect();
    if (!adminKey) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/v0/system/logs/stream', {
        headers: { 'x-admin-key': adminKey },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Failed to connect: ${response.statusText}`);

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const blockLines = block.split('\n');
          let eventData = '';
          let isSyslogEvent = false;

          for (const line of blockLines) {
            if (line.startsWith('event: syslog')) {
              isSyslogEvent = true;
            } else if (line.startsWith('event: ping')) {
              isSyslogEvent = false;
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5);
            }
          }

          if (isSyslogEvent && eventData) {
            try {
              const data = JSON.parse(eventData);
              if (!isPausedRef.current) {
                setLogs((prev) => [...prev.slice(-999), data]);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Log stream error:', err);
      }
    }
  };

  useEffect(() => {
    if (!isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const clearLogs = () => setLogs([]);

  const applyLoggingLevel = async () => {
    if (selectedLevel === currentLevel) return;
    setIsUpdatingLevel(true);
    try {
      const state = await api.setLoggingLevel(selectedLevel);
      setCurrentLevel(state.level);
      setStartupLevel(state.startupLevel);
      setSupportedLevels(state.supportedLevels);
      setSelectedLevel(state.level);
      toast.success(`Logging level set to ${state.level}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update logging level');
    } finally {
      setIsUpdatingLevel(false);
    }
  };

  const resetLoggingLevel = async () => {
    setIsUpdatingLevel(true);
    try {
      const state = await api.resetLoggingLevel();
      setCurrentLevel(state.level);
      setStartupLevel(state.startupLevel);
      setSupportedLevels(state.supportedLevels);
      setSelectedLevel(state.level);
      toast.success(`Logging level reset to ${state.level}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset logging level');
    } finally {
      setIsUpdatingLevel(false);
    }
  };

  return (
    <ListPage
      title={
        <span className="inline-flex items-center gap-2">
          <Terminal className="size-5 text-foreground-subtle" strokeWidth={1.75} />
          System Logs
        </span>
      }
      subtitle="Live stream of backend system logs."
    >
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-border">
          <h3 className="text-base font-medium text-foreground m-0">Live output</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedLevel}
              onValueChange={setSelectedLevel}
              disabled={isUpdatingLevel}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLevels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyLoggingLevel}
              disabled={isUpdatingLevel || selectedLevel === currentLevel}
            >
              Apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetLoggingLevel}
              disabled={isUpdatingLevel || currentLevel === startupLevel}
            >
              <RotateCcw strokeWidth={1.75} />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play strokeWidth={1.75} /> : <Pause strokeWidth={1.75} />}
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <Trash2 strokeWidth={1.75} />
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="text-xs text-foreground-muted">
            Current level: <span className="font-medium text-foreground">{currentLevel}</span> ·
            Startup default: <span className="font-medium text-foreground">{startupLevel}</span> ·
            Runtime changes reset on restart.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {moduleFilter.length > 0 ? (
                moduleFilter.map((m) => (
                  <Pill key={m} tone="accent" size="sm">
                    <span className="font-mono">{m}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = moduleFilter.filter((x) => x !== m);
                        setModuleFilterState(next);
                        try {
                          if (next.length === 0) {
                            await api.clearModuleFilter();
                          } else {
                            await api.setModuleFilter(next);
                          }
                        } catch {
                          setModuleFilterState(moduleFilter);
                        }
                      }}
                      className="-mr-0.5 ml-0.5 rounded-full p-0.5 text-accent/70 hover:bg-accent/10 hover:text-accent"
                      aria-label={`Remove ${m}`}
                    >
                      <X className="size-3" strokeWidth={2} />
                    </button>
                  </Pill>
                ))
              ) : (
                <span className="text-xs italic text-foreground-subtle">All modules</span>
              )}
            </div>
            <Input
              type="text"
              value={moduleInput}
              onChange={(e) => setModuleInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && moduleInput.trim()) {
                  e.preventDefault();
                  const mod = moduleInput.trim();
                  if (!moduleFilter.includes(mod)) {
                    const next = [...moduleFilter, mod];
                    setModuleFilterState(next);
                    setModuleInput('');
                    try {
                      await api.setModuleFilter(next);
                    } catch {
                      setModuleFilterState(moduleFilter);
                    }
                  } else {
                    setModuleInput('');
                  }
                }
              }}
              placeholder="Add module…"
              className="h-7 w-32 text-xs"
            />
            {moduleFilter.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={async () => {
                  setModuleFilterState([]);
                  try {
                    await api.clearModuleFilter();
                  } catch {
                    // ignore
                  }
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="bg-surface-sunken p-3 overflow-y-auto font-mono text-xs text-foreground h-[60vh] min-h-[320px] max-h-[700px]">
          {logs.length === 0 && (
            <div className="mt-8 text-center italic text-foreground-subtle">Waiting for logs…</div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              className="mb-1 break-all rounded-sm px-1 py-0.5 hover:bg-surface-elevated"
            >
              <span className="mr-2 text-foreground-subtle">[{log.timestamp}]</span>
              <span
                className={cn(
                  'mr-2 font-medium',
                  LEVEL_CLASS[log.level?.toLowerCase()] ?? 'text-foreground-muted'
                )}
              >
                {log.level?.toUpperCase()}:
              </span>
              <span>{log.message}</span>
              {Object.keys(log).filter((k) => !['level', 'message', 'timestamp'].includes(k))
                .length > 0 && (
                <pre className="ml-8 mt-1 whitespace-pre-wrap text-[11px] text-foreground-muted">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(log).filter(
                        ([k]) => !['level', 'message', 'timestamp'].includes(k)
                      )
                    ),
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </ListPage>
  );
};
