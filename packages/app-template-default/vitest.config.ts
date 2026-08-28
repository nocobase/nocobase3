import { fileURLToPath } from 'node:url';

import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default createReactVitestConfig({
  resolve: {
    alias: [
      {
        find: '@/jobs',
        replacement: fileURLToPath(new URL('./server/jobs', import.meta.url)),
      },
      {
        find: '@/services',
        replacement: fileURLToPath(
          new URL('./server/services', import.meta.url),
        ),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./client', import.meta.url)),
      },
    ],
  },
  test: {
    root,
    include: [
      'tests/components/loading.test.tsx',
      'tests/logic/agent-annotations.test.ts',
      'tests/logic/app-server.test.ts',
      'tests/logic/client-auth.test.tsx',
      'tests/logic/client-plugins.test.ts',
      'tests/logic/client-refine-runtime.test.ts',
      'tests/logic/client-routes.test.ts',
      'tests/logic/client-runtime.test.ts',
      'tests/logic/client-shell.test.tsx',
      'tests/logic/client-theme.test.tsx',
      'tests/logic/config.test.ts',
      'tests/logic/dev-ports.test.ts',
      'tests/logic/dev-readiness.test.ts',
      'tests/logic/dev-plugin-watches.test.ts',
      'tests/logic/e2e-support.test.ts',
      'tests/logic/lifecycle.test.ts',
      'tests/logic/plugins.test.ts',
      'tests/logic/public-request.test.ts',
      'tests/logic/workflow-management.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
});
