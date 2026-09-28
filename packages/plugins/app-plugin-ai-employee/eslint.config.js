import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    // Development showcases use the browser-source validation path.
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
    // Built-in AI resources are relocated server-side but retain their existing lint scope.
    'server/ai/**',
    'ai/**',
    'server/repository/**',
    'server/route/*.ts',
    'server/service/**',
    'server/internal/**',
  ],
  overrides: [
    {
      // The Registry source is installed into an application's client/extensions,
      // where it is linted by the application's portal configuration. Hold it to
      // that standard here, typed through its own tsconfig.
      name: 'app-plugin-ai-employee/registry-source',
      files: ['registry/**/*.{ts,tsx}'],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: ['./tsconfig.registry.json'],
        },
      },
    },
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
