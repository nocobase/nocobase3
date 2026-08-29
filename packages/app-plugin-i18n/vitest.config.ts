import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';
import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      createReactVitestConfig({
        test: { name: 'client', include: ['tests/client/**/*.test.tsx'] },
      }),
      createNodeVitestConfig({
        test: { name: 'node', include: ['tests/server/**/*.test.ts'] },
      }),
    ],
  },
});
