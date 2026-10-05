import { Component, type ErrorInfo, type ReactNode } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '../../hooks/useMonacoTheme';
import { AlertTriangle, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

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
        <div className="h-[400px] sm:h-[500px] flex items-center justify-center bg-surface/30 text-foreground-muted rounded-md">
          <div className="text-center p-6">
            <AlertTriangle className="mx-auto mb-3 text-warning-text" size={32} />
            <p className="text-sm font-semibold mb-1">Editor failed to load</p>
            <p className="font-sans text-[11px] text-foreground-subtle">
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Mounted only while the card body renders (i.e. expanded), so Monaco and its
 * theme hook (useMonaco -> loader.init) are not loaded until the user opens it.
 */
function SnapshotEditor({ config }: { config: string }) {
  const monacoTheme = useMonacoTheme();
  return (
    <div className="h-[400px] sm:h-[500px] lg:h-[600px] rounded-sm overflow-hidden">
      <EditorErrorBoundary>
        <Editor
          height="100%"
          defaultLanguage="json"
          value={config}
          theme={monacoTheme}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </EditorErrorBoundary>
    </div>
  );
}

interface ConfigurationSnapshotProps {
  config: string;
  loaded: boolean;
  restarting: boolean;
  onRefresh: () => void;
  onRestart: () => void | Promise<void>;
  onExport: () => void;
}

export function ConfigurationSnapshot({
  config,
  loaded,
  restarting,
  onRefresh,
  onRestart,
  onExport,
}: ConfigurationSnapshotProps) {
  return (
    <SectionCard
      title="Configuration Snapshot"
      collapsible
      defaultOpen={false}
      extra={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            leftIcon={<RotateCcw size={14} />}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRestart}
            isLoading={restarting}
            leftIcon={<RefreshCw size={14} />}
          >
            Restart
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={!loaded}
            leftIcon={<Download size={14} />}
          >
            Export JSON
          </Button>
        </div>
      }
    >
      <SnapshotEditor config={config} />
    </SectionCard>
  );
}
