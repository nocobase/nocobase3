import { createRequire } from 'node:module';
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
        find: '@',
        replacement: fileURLToPath(new URL('./client', import.meta.url)),
      },
    ],
  },
  test: {
    root,
    execArgv: ['--import', createRequire(import.meta.url).resolve('tsx/esm')],
    server: {
      deps: {
        // Keep this CommonJS package in Vite's interop path with the ESM-only loader.
        inline: ['bloom-filters'],
        // Native require(ESM) and tests must share identity-sensitive DB exports.
        external: [
          /\/@nocobase\/(?:db(?:-[^/]+)?|service-provider|repository-input)(?:\/|$)/,
          /\/packages\/libs\/(?:db(?:-[^/]+)?|service-provider|repository-input)\//,
        ],
      },
    },
    // A glob rather than a list of filenames. The list had to be edited by hand for every test added or removed and
    // silently drifted: it named a file that no longer existed while several real test files were absent from it, so
    // those tests were never run at all.
    include: ['tests/**/*.test.{ts,tsx}'],
    // A generated application ships no `tests/` — the template's `files` field does not include it — so an empty run
    // is the expected outcome there rather than a failure on `pnpm test` before a line of code has been written.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
});
