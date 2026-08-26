import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { fileURLToPath } from 'node:url';

export default createNodeVitestConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: [
      {
        find: '@/extensions/nocobase-files-provider-ui',
        replacement: fileURLToPath(
          new URL('./registry/provider-ui/index.ts', import.meta.url),
        ),
      },
      {
        find: '@',
        replacement: fileURLToPath(
          new URL('../app-template-default/client', import.meta.url),
        ),
      },
    ],
  },
});
