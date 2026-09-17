import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { SectionCard } from '../ui/SectionCard';
import { Switch } from '../ui/Switch';

export function TraceCaptureSettings() {
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getCaptureTraceOnError()
      .then(({ enabled: value }) => {
        setEnabled(value);
        setLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load capture-trace-on-error setting:', e);
        toast.error('Failed to load trace capture settings');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (checked: boolean) => {
    const previous = enabled;
    setEnabled(checked);
    setSaving(true);
    try {
      const { enabled: next } = await api.setCaptureTraceOnError(checked);
      setEnabled(next);
      toast.success(`Capture trace on error ${next ? 'enabled' : 'disabled'}`);
    } catch (e) {
      setEnabled(previous);
      toast.error((e as Error).message, 'Failed to update trace capture settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Trace Capture" collapsible defaultOpen={false}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent" />
          <div>
            <p className="font-sans text-[12px] font-medium text-foreground">
              Capture Trace on Error
            </p>
            <p className="font-sans text-[11px] text-foreground-subtle">
              When enabled, debug traces are stored for requests that write to the inference error
              log or trigger a cooldown, even while global debug tracing is off.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          disabled={!loaded || saving}
          aria-label="Toggle capture trace on error"
        />
      </div>
    </SectionCard>
  );
}
