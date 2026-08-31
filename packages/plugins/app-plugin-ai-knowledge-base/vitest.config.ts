import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  test: {
    // Server tests use Node by default. Component tests opt into jsdom with
    // Vitest's per-file environment annotation.
    environment: 'node',
  },
});
