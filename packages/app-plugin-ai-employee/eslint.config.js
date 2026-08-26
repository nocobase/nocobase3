import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  // The migrated legacy runtime is behavior-preserving and is covered by its
  // existing test suite. Type-aware lint cleanup will be handled separately.
  ignores: [
    'dist/**',
    'tests/**',
    'server/agent/**',
    'server/auth/**',
    'server/ai-employees/**',
    'server/builtin/**',
    'server/repository/**',
    'server/routes/*.ts',
    'server/service/**',
    'server/runtime.ts',
  ],
});
