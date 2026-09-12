import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';
import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { defineConfig } from 'vitest/config';

// The package spans both runtimes, so its tests do too: `tests/client` needs a DOM, while the core and server entry
// points run on Node. Projects keep each set in the environment it actually targets.
export default defineConfig({
  test: {
    projects: [
      createReactVitestConfig({
        test: { name: 'client', include: ['tests/client/**/*.test.tsx'] },
      }),
      createNodeVitestConfig({
        test: {
          name: 'node',
          include: ['tests/*.test.ts', 'tests/server/**/*.test.ts'],
          // The exported types are part of the contract: a locale type that stops catching a typo is a regression
          // no runtime test would notice.
          typecheck: {
            enabled: true,
            include: ['tests/**/*.test-d.ts'],
          },
        },
      }),
    ],
  },
});
