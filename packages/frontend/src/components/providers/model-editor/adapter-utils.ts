export type AdapterEntry = string | Record<string, any>;

// Single source of truth for the known per-model/per-provider adapters lives in
// ProviderTransformationsTab (provider-level adapter picker); re-exported here so
// the model editor doesn't maintain a second, divergent copy of the same list.
export { KNOWN_ADAPTERS } from '../ProviderTransformationsTab';

export function normalizeAdapterEntries(value: unknown): AdapterEntry[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value as AdapterEntry];
}

export function getAdapterName(entry: unknown): string | undefined {
  return typeof entry === 'string'
    ? entry
    : entry && typeof entry === 'object' && typeof (entry as Record<string, any>).name === 'string'
      ? (entry as Record<string, any>).name
      : undefined;
}

export function renameRecordKey<T>(record: Record<string, T>, oldKey: string, newKey: string) {
  if (oldKey === newKey) return record;
  const next = { ...record };
  if (Object.prototype.hasOwnProperty.call(next, oldKey)) {
    next[newKey] = next[oldKey];
    delete next[oldKey];
  }
  return next;
}

export function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}
