import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    'tests/**',
    'server/agent/**',
    'server/ai-employees/**',
    'ai/**',
    'server/repository/**',
    'server/routes/*.ts',
    'server/service/**',
    'server/runtime.ts',
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
