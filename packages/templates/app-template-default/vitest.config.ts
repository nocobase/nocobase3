import { fileURLToPath } from 'node:url';

import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default createReactVitestConfig({
  resolve: {
    alias: [
      {
        find: /^@nocobase\/app-client$/,
        replacement: fileURLToPath(
          new URL('../../app/app-client/src/index.ts', import.meta.url),
        ),
      },
      {
        find: '@/jobs',
        replacement: fileURLToPath(new URL('./server/jobs', import.meta.url)),
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
      'tests/components/language-switcher.test.tsx',
      'tests/components/loading.test.tsx',
      'tests/logic/agent-annotations.test.ts',
      'tests/logic/app-server.test.ts',
      'tests/logic/client-auth.test.tsx',
      'tests/logic/client-plugin-registry.test.ts',
      'tests/logic/client-routes.test.ts',
      'tests/logic/client-runtime.test.ts',
      'tests/logic/client-settings.test.tsx',
      'tests/logic/client-shell.test.tsx',
      'tests/logic/client-theme.test.tsx',
      'tests/logic/config.test.ts',
      'tests/logic/dev-ports.test.ts',
      'tests/logic/inspect-client.test.ts',
      'tests/logic/dev-readiness.test.ts',
      'tests/logic/dev-plugin-watches.test.ts',
      'tests/logic/lifecycle.test.ts',
      'tests/logic/notification-in-app-runtime.test.tsx',
      'tests/logic/plugin-commands.test.ts',
      'tests/logic/skills-example-integration.test.tsx',
      'tests/logic/tailwind-sources.test.ts',
      'tests/logic/workflow-management.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
});
