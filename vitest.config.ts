import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/web/src'),
    },
  },
  test: {
    include: [
      'apps/web/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
      'packages/core/src/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
      'tests/**/*.spec.ts',
    ],
  },
});
