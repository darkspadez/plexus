import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LineChart, Save } from 'lucide-react';
import { useGrafanaUrl, useSaveGrafanaUrl } from '../../hooks/queries/useConfig';
import {
  grafanaFormSchema,
  toGrafanaPayload,
  type GrafanaFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

/**
 * Grafana dashboard link support — this is design-branch-only work with no
 * upstream equivalent; kept as its own file for consistency with the other
 * settings groups rather than inlined in the Config page.
 */
export function GrafanaSettings() {
  const grafanaQuery = useGrafanaUrl();
  const saveGrafanaUrl = useSaveGrafanaUrl();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<GrafanaFormValues>({
    resolver: zodResolver(grafanaFormSchema),
    defaultValues: { grafanaUrl: '' },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (grafanaQuery.data) {
      reset({ grafanaUrl: grafanaQuery.data.grafanaUrl });
      setLoaded(true);
    }
  }, [grafanaQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: GrafanaFormValues) => {
    const payload = toGrafanaPayload(values);
    saveGrafanaUrl.mutate(payload, {
      onSuccess: (updated) => {
        reset({ grafanaUrl: updated.grafanaUrl });
      },
    });
  };

  return (
    <SectionCard
      title="Grafana"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveGrafanaUrl.isPending}
          disabled={!loaded || !isValid || saveGrafanaUrl.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="grafana-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <LineChart size={16} className="text-accent" />
            <div>
              <p className="font-sans text-[12px] font-medium text-foreground">Grafana URL</p>
              <p className="font-sans text-[11px] text-foreground-subtle">
                Base URL of your Grafana instance, used to link out to dashboards from Plexus. Leave
                blank to hide those links.
              </p>
            </div>
          </div>

          <div>
            <input
              id="grafanaUrl"
              type="text"
              placeholder="https://grafana.example.com"
              {...register('grafanaUrl')}
              className="w-full max-w-md h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.grafanaUrl && (
              <p className="text-[11px] text-warning mt-1">{errors.grafanaUrl.message}</p>
            )}
          </div>
        </div>
      </form>
    </SectionCard>
  );
}
