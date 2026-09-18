import { fileURLToPath } from 'node:url';
import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  resolve: {
    alias: {
      '@/components/ui/card': fileURLToPath(
        new URL(
          '../app-plugin-ai-employee/registry/nocobase-ai/shared/ui/card.tsx',
          import.meta.url,
        ),
      ),
      '@/components/ui': fileURLToPath(
        new URL('../app-plugin-hub/client/components/ui', import.meta.url),
      ),
    },
  },
});
