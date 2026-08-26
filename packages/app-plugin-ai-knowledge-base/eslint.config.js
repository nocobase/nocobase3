import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  rules: {
    // HTTP compatibility payloads are intentionally decoded from unknown legacy values.
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
  },
  overrides: [
    {
      name: 'app-plugin-ai-knowledge-base/ported-live-react-runtime',
      files: [
        'client/components/**/*.{ts,tsx}',
        'client/hooks/**/*.{ts,tsx}',
        'client/page/**/*.{ts,tsx}',
      ],
      rules: {
        // The copied Live state machines intentionally reset identity-bound state in effects.
        'react-hooks/refs': 'off',
        'react-hooks/set-state-in-effect': 'off',
        '@eslint-react/set-state-in-effect': 'off',
        '@eslint-react/exhaustive-deps': 'off',
        '@eslint-react/naming-convention-ref-name': 'off',
        '@eslint-react/no-array-index-key': 'off',
        // React Router navigation is promise-capable in v7; event handlers intentionally fire it without blocking UI.
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
      },
    },
    {
      name: 'app-plugin-ai-knowledge-base/library-fast-refresh',
      files: ['client/**/*.{ts,tsx}'],
      rules: {
        // This is a published component library, not a Vite application module graph.
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
});
