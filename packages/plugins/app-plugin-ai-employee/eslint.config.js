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
    // Relocated legacy manager implementations retain their existing lint scope.
    'server/manager/ai-*.ts',
    'server/manager/built-in-manager.ts',
    'server/manager/knowledge-base-manager.ts',
    'server/manager/llm-stream-cached-manager.ts',
    'server/manager/sub-agents/**',
    'server/manager/work-context/**',
    'ai/**',
    'server/repository/**',
    'server/route/*.ts',
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
