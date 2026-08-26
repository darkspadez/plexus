import crypto from 'node:crypto';

export function generateApiKeySecret(): string {
  return `sk-${crypto.randomBytes(24).toString('hex')}`;
}
