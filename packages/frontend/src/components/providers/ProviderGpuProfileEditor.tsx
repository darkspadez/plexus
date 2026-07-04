import { GPU_PROFILE_OPTIONS, resolveGpuParams } from '@plexus/shared';
import type { Provider } from '../../lib/api';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
}

export function ProviderGpuProfileEditor({ editingProvider, setEditingProvider }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-sans text-[13px] font-medium text-foreground-muted">GPU Profile</label>
      <div className="flex gap-3 items-end">
        <select
          className="flex-1 h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
          value={editingProvider.gpu_profile || ''}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) {
              const resolved = resolveGpuParams('B200');
              setEditingProvider({
                ...editingProvider,
                gpu_profile: undefined,
                gpu_ram_gb: resolved.ram_gb,
                gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                gpu_flops_tflop: resolved.flops_tflop,
                gpu_power_draw_watts: resolved.power_draw_watts,
              });
            } else if (value === 'custom') {
              const resolved = resolveGpuParams('custom', {
                ram_gb: editingProvider.gpu_ram_gb,
                bandwidth_tb_s: editingProvider.gpu_bandwidth_tb_s,
                flops_tflop: editingProvider.gpu_flops_tflop,
                power_draw_watts: editingProvider.gpu_power_draw_watts,
              });
              setEditingProvider({
                ...editingProvider,
                gpu_profile: 'custom',
                gpu_ram_gb: resolved.ram_gb,
                gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                gpu_flops_tflop: resolved.flops_tflop,
                gpu_power_draw_watts: resolved.power_draw_watts,
              });
            } else {
              const resolved = resolveGpuParams(value);
              setEditingProvider({
                ...editingProvider,
                gpu_profile: value,
                gpu_ram_gb: resolved.ram_gb,
                gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                gpu_flops_tflop: resolved.flops_tflop,
                gpu_power_draw_watts: resolved.power_draw_watts,
              });
            }
          }}
        >
          <option value="">Default (B200)</option>
          {GPU_PROFILE_OPTIONS.map((profile) => (
            <option key={profile.value} value={profile.value}>
              {profile.label}
            </option>
          ))}
        </select>
      </div>
      {editingProvider.gpu_profile === 'custom' && (
        <div className="mt-2 p-3 border border-border rounded-md bg-surface-sunken">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="font-sans text-[11px] font-medium text-foreground-muted">
                RAM (GB)
              </label>
              <input
                className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                type="number"
                step="1"
                min="1"
                value={editingProvider.gpu_ram_gb || ''}
                onChange={(e) =>
                  setEditingProvider({
                    ...editingProvider,
                    gpu_ram_gb: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g. 80"
              />
            </div>
            <div>
              <label className="font-sans text-[11px] font-medium text-foreground-muted">
                Bandwidth (TB/s)
              </label>
              <input
                className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                type="number"
                step="0.1"
                min="0.1"
                value={editingProvider.gpu_bandwidth_tb_s || ''}
                onChange={(e) =>
                  setEditingProvider({
                    ...editingProvider,
                    gpu_bandwidth_tb_s: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g. 3.35"
              />
            </div>
            <div>
              <label className="font-sans text-[11px] font-medium text-foreground-muted">
                FLOPS (TFLOPs)
              </label>
              <input
                className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                type="number"
                step="100"
                min="1"
                value={editingProvider.gpu_flops_tflop || ''}
                onChange={(e) =>
                  setEditingProvider({
                    ...editingProvider,
                    gpu_flops_tflop: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g. 4000"
              />
            </div>
            <div>
              <label className="font-sans text-[11px] font-medium text-foreground-muted">
                Power Draw (Watts)
              </label>
              <input
                className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                type="number"
                step="10"
                min="1"
                value={editingProvider.gpu_power_draw_watts || ''}
                onChange={(e) =>
                  setEditingProvider({
                    ...editingProvider,
                    gpu_power_draw_watts: parseInt(e.target.value, 10) || undefined,
                  })
                }
                placeholder="e.g. 700"
              />
            </div>
          </div>
        </div>
      )}
      <div className="text-[11px] text-foreground-subtle">
        Used for inference energy calculation. Select a preset or enter custom GPU specs.
      </div>
    </div>
  );
}
