import { Component, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';
import { RotateCcw, AlertTriangle, Download, Upload, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui-v2/card';
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
import { FormPage } from '../components/templates';
import type { CardLayout } from '../types/card';
import { DEFAULT_CARD_ORDER, LAYOUT_STORAGE_KEY } from '../types/card';
import { ThemeSection } from './config/ThemeSection';
import { useTheme } from '../contexts/ThemeContext';

class EditorErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Monaco Editor failed to load:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-[400px] items-center justify-center rounded-md border border-border bg-surface-elevated text-foreground-muted sm:h-[500px]">
          <div className="p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 size-8 text-warning" strokeWidth={1.5} />
            <p className="mb-1 text-sm font-medium text-foreground">Editor failed to load</p>
            <p className="text-xs text-foreground-muted">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Config = () => {
  const { resolved: themeMode } = useTheme();
  const [config, setConfig] = useState('');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await api.getConfigExport();
      setConfig(JSON.stringify(data, null, 2));
      setIsConfigLoaded(true);
    } catch (e) {
      console.error('Failed to load config:', e);
      setIsConfigLoaded(false);
      toast.error('Failed to load config');
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cardLayout, setCardLayout] = useState<CardLayout>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCardLayout(parsed);
      } catch {
        console.error('Failed to parse card layout');
      }
    }
  }, []);

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportLayout = () =>
    triggerDownload(
      JSON.stringify(cardLayout, null, 2),
      'plexus-card-layout.json',
      'application/json'
    );

  const handleExportConfig = () =>
    triggerDownload(config, 'plexus-config-export.json', 'application/json');

  const handleImportLayout = () => fileInputRef.current?.click();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as CardLayout;

        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item.id === 'string' && typeof item.order === 'number')
        ) {
          const validIds = new Set<string>(DEFAULT_CARD_ORDER);
          const allIdsValid = parsed.every((item: { id: string }) => validIds.has(item.id));
          if (!allIdsValid) {
            toast.error('Invalid card layout: contains unknown card IDs');
            return;
          }

          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(parsed));
          setCardLayout(parsed);
          toast.success('Card layout imported');
        } else {
          toast.error('Invalid card layout format');
        }
      } catch {
        toast.error('Failed to import: Invalid JSON file');
      }
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  const confirmRestart = async () => {
    setRestartConfirmOpen(false);
    setIsRestarting(true);
    try {
      await api.restart();
    } catch (e) {
      toast.error((e as Error).message ?? 'Restart failed');
      setIsRestarting(false);
    }
  };

  return (
    <FormPage
      title="Settings"
      subtitle="View current system configuration (read-only). Use the Providers, Models, and Keys pages to make changes."
    >
      <ThemeSection />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Configuration export</CardTitle>
            <CardDescription>
              The exact configuration the backend is currently running.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadConfig}>
              <RotateCcw strokeWidth={1.75} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestartConfirmOpen(true)}
              disabled={isRestarting}
            >
              <RefreshCw className={isRestarting ? 'animate-spin' : undefined} strokeWidth={1.75} />
              {isRestarting ? 'Restarting…' : 'Restart'}
            </Button>
            <Button size="sm" onClick={handleExportConfig} disabled={!isConfigLoaded}>
              <Download strokeWidth={1.75} />
              Export JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="h-[400px] overflow-hidden border-t border-border sm:h-[500px] lg:h-[600px]">
            <EditorErrorBoundary>
              <Editor
                height="100%"
                defaultLanguage="json"
                value={config}
                theme={themeMode === 'light' ? 'vs' : 'vs-dark'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  fontFamily: 'Geist Mono, "Fira Code", monospace',
                }}
              />
            </EditorErrorBoundary>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Card layout</CardTitle>
            <CardDescription>
              Import or export your Live Metrics card layout configuration.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportLayout}>
              <Download strokeWidth={1.75} />
              Export
            </Button>
            <Button size="sm" onClick={handleImportLayout}>
              <Upload strokeWidth={1.75} />
              Import
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />

          <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-subtle">
            Current card order
          </h4>
          <div className="flex flex-wrap gap-2">
            {cardLayout.length === 0 ? (
              <p className="text-xs italic text-foreground-subtle">
                Default layout — no customizations saved.
              </p>
            ) : (
              cardLayout.map((card, index) => (
                <span
                  key={card.id}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-foreground"
                >
                  <span className="text-foreground-subtle">{index + 1}.</span>
                  <span className="font-mono">{card.id}</span>
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={restartConfirmOpen} onOpenChange={setRestartConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Plexus?</AlertDialogTitle>
            <AlertDialogDescription>
              This will briefly interrupt all ongoing requests. Confirm to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestart}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormPage>
  );
};
