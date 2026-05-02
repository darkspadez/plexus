import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';
import { RotateCcw, AlertTriangle, Download, RefreshCw } from 'lucide-react';
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

  const handleExportConfig = () =>
    triggerDownload(config, 'plexus-config-export.json', 'application/json');

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
