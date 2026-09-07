import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    // Registry and development showcases use the browser-source validation path.
    'registry/**',
    'client/dev/**',
    'tests/**',
    'server/agent/**',
    'server/ai-employees/**',
    // Relocated legacy manager implementations retain their existing lint scope.
    'server/managers/ai-*.ts',
    'server/managers/built-in-manager.ts',
    'server/managers/knowledge-base-manager.ts',
    'server/managers/llm-stream-cached-manager.ts',
    'server/managers/sub-agents/**',
    'server/managers/work-context/**',
    'ai/**',
    'server/repository/**',
    'server/routes/*.ts',
    'server/service/**',
    'server/internal/**',
  ],
  overrides: [
    {
      name: 'app-plugin-ai-employee/client-runtime',
      files: ['client/**/*.{ts,tsx}'],
      rules: {
        'react-refresh/only-export-components': 'off',
        '@typescript-eslint/no-base-to-string': 'off',
        'react-hooks/set-state-in-effect': 'off',
        '@eslint-react/set-state-in-effect': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
      },
    },
  ],
});
