import type { UserQuota } from '../../lib/api';
import type { EditableKeyConfig } from '../../lib/api/keys';
import type { EditableQuota } from './types';

export const EMPTY_KEY: EditableKeyConfig = {
  key: '',
  comment: '',
};

export const EMPTY_QUOTA: EditableQuota = {
  name: '',
  type: 'rolling',
  limitType: 'requests',
  limit: 1000,
  duration: '1h',
  allowedProviders: [],
  excludedProviders: [],
  allowedModels: [],
  excludedModels: [],
  shared: false,
  warnAt: undefined,
} satisfies UserQuota & { readonly name: string };
