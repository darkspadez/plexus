import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Network, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useSaveTrustedProxies } from '../../hooks/queries/useConfig';
import {
  networkFormSchema,
  toNetworkPayload,
  type NetworkFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { TagSelect } from '../ui/TagSelect';

export function NetworkSettings() {
  const saveTrustedProxies = useSaveTrustedProxies();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<NetworkFormValues>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: { trustedProxies: [] },
  });

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getTrustedProxies().then((result) => {
      reset({ trustedProxies: result.trustedProxies });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: NetworkFormValues) => {
    const payload = toNetworkPayload(values);
    saveTrustedProxies.mutate(payload, {
      onSuccess: (result) => {
        reset({ trustedProxies: result.trustedProxies });
      },
    });
  };

  return (
    <SectionCard
      title="Network Settings"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveTrustedProxies.isPending}
          disabled={!loaded || !isValid || saveTrustedProxies.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="network-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-accent" />
            <div>
              <p className="font-sans text-[12px] font-medium text-foreground">Trusted Proxies</p>
              <p className="font-sans text-[11px] text-foreground-subtle">
                IPs/CIDRs of reverse proxies whose forwarding headers (X-Forwarded-For,
                CF-Connecting-IP, …) are believed when resolving a client&apos;s IP. Requests
                arriving directly from any other address use their real connection IP instead, so
                spoofed headers cannot defeat per-key IP allowlists.
              </p>
            </div>
          </div>

          <div>
            <Controller
              control={control}
              name="trustedProxies"
              render={({ field }) => (
                <TagSelect
                  label="Trusted Proxy IPs"
                  placeholder="e.g. 10.0.0.0/8  172.16.0.0/12  192.168.1.5"
                  options={[]}
                  selected={field.value}
                  allowCustom
                  splitOnSpace
                  onChange={field.onChange}
                />
              )}
            />
            <p className="text-xs text-foreground-subtle mt-2">
              Type entries separated by spaces. The default trust-all list is <code>0.0.0.0/0</code>{' '}
              plus <code>::/0</code> — keep this only if Plexus is not publicly reachable except
              through your proxy. An empty list trusts no proxies. Accepts IPv4/IPv6, CIDR, and
              ranges.
            </p>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}
