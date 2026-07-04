import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Force the ESM entrypoint of zod so that `import { z } from 'zod'` works
      // in vitest's node environment (where CJS interop sometimes loses named re-exports).
      zod: path.resolve(__dirname, 'node_modules/zod/index.js'),
    },
  },
  test: {
    name: 'frontend',
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    environment: 'node',
    globals: false,
    reporters: ['dot'],
  },
});
