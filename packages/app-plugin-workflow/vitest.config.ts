import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@nocobase/app-database': fileURLToPath(
        new URL('../app-database/src/index.ts', import.meta.url),
      ),
      '@nocobase/queue': fileURLToPath(
        new URL('../queue/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
