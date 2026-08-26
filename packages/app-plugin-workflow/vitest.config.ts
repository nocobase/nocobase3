import { fileURLToPath } from 'node:url';

import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
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
    include: ['tests/**/*.test.ts'],
  },
});
