import { fileURLToPath } from 'node:url';
import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  resolve: {
    alias: {
      '@/components/ui/dialog': fileURLToPath(
        new URL(
          '../app-plugin-ai-knowledge-base/client/components/ui/dialog.tsx',
          import.meta.url,
        ),
      ),
      '@': fileURLToPath(
        new URL('../../templates/app-template-default/client', import.meta.url),
      ),
    },
  },
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
});
