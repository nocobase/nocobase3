import {
  createPortalConfig,
  react,
  typeChecked,
} from '@nocobase/dev-config/eslint';

const reactPlugins = react[0].plugins;
const typescriptPlugins = typeChecked.find(
  (config) => config.plugins?.['@typescript-eslint'],
).plugins;

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'public/r/**',
    'public/storage/**',
    'src/extensions/**',
    'storage/**',
  ],
  overrides: [
    {
      name: 'app-template-default/workflow-dsl-server-project',
      files: ['server/workflows/dsl.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.server.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'app-template-default/database-task-project',
      files: ['database/{migrations,seeds}/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'app-template-default/async-jsx-handlers',
      files: [
        'client/**/*.{ts,tsx}',
        'registry/**/*.{ts,tsx}',
        'server/**/*.{ts,tsx}',
      ],
      ignores: ['**/tests/**', '**/*.{test,spec}.{ts,tsx}'],
      plugins: typescriptPlugins,
      rules: {
        // Async JSX handlers are an intentional project convention. Keep the
        // remaining no-misused-promises checks enabled for non-attribute uses.
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        // These cleanup-only rules produce a large legacy diff without
        // improving runtime safety. New code can adopt them in a later pass.
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      },
    },
    {
      name: 'app-template-default/dynamic-contract-boundaries',
      files: [
        'client/components/ui/chart.tsx',
        'registry/nocobase-acl/components/role-switcher.tsx',
        'registry/nocobase-ai/components/page-elements/page-element-provider.tsx',
        'registry/nocobase-ai/providers/form-registry.tsx',
        'registry/nocobase-i18n/components/language-switcher.tsx',
        'registry/nocobase-mail/components/mail-api.ts',
        'registry/nocobase-mail/components/use-mail-messages.ts',
      ],
      plugins: typescriptPlugins,
      rules: {
        // These adapters intentionally validate or normalize untyped values
        // received from Recharts, extension registries, or REST responses.
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
    {
      name: 'app-template-default/dynamic-string-normalization',
      files: [
        'client/components/resources/resource-label.ts',
        'registry/nocobase-ai/components/chat/work-context-chip.tsx',
        'registry/nocobase-ai/providers/chat-provider.tsx',
        'registry/nocobase-ai/providers/sub-agent-stream.ts',
        'registry/nocobase-ai/providers/ui-message-stream.ts',
        'registry/nocobase-ai/providers/use-chat-attachments.ts',
        'registry/nocobase-ai/services/nocobase-ai-service.ts',
        'registry/nocobase-error-boundary/error-diagnostics.ts',
        'registry/nocobase-i18n/components/language-switcher.tsx',
      ],
      plugins: typescriptPlugins,
      rules: {
        // These files deliberately apply JavaScript string coercion while
        // normalizing unknown API payloads for display or stable identifiers.
        '@typescript-eslint/no-base-to-string': 'off',
      },
    },
    {
      name: 'app-template-default/react-compiler-incremental-adoption',
      files: [
        'client/**/*.{js,jsx,ts,tsx}',
        'registry/**/*.{js,jsx,ts,tsx}',
        'tests/**/*.{js,jsx,ts,tsx}',
      ],
      plugins: reactPlugins,
      rules: {
        // The existing Portal and Registry sources predate the React Compiler
        // lint rules. Adopt those semantic migrations incrementally instead of
        // turning this ESLint/type-aware migration into a runtime refactor.
        '@eslint-react/dom-no-dangerously-set-innerhtml': 'off',
        '@eslint-react/exhaustive-deps': 'off',
        '@eslint-react/naming-convention-ref-name': 'off',
        '@eslint-react/no-array-index-key': 'off',
        '@eslint-react/no-forward-ref': 'off',
        '@eslint-react/no-nested-component-definitions': 'off',
        '@eslint-react/no-unnecessary-use-prefix': 'off',
        '@eslint-react/purity': 'off',
        '@eslint-react/set-state-in-effect': 'off',
        '@eslint-react/static-components': 'off',
        '@eslint-react/use-state': 'off',
        'react-hooks/immutability': 'off',
        'react-hooks/incompatible-library': 'off',
        'react-hooks/preserve-manual-memoization': 'off',
        'react-hooks/purity': 'off',
        'react-hooks/refs': 'off',
        'react-hooks/set-state-in-effect': 'off',
        'react-hooks/static-components': 'off',
        'react-hooks/use-memo': 'off',
        // Registry extension modules intentionally co-locate exported contracts
        // and components, so they are not Fast Refresh-only modules.
        'react-refresh/only-export-components': 'off',
      },
    },
    {
      name: 'app-template-default/intentional-hook-stability',
      files: [
        'client/components/auth/auto-redirect-provider.tsx',
        'registry/nocobase-client/remote-select.tsx',
      ],
      plugins: reactPlugins,
      rules: {
        // These hooks intentionally depend on a serialized query value or a
        // stable method rather than the containing object identity.
        'react-hooks/exhaustive-deps': 'off',
      },
    },
    {
      name: 'app-template-default/eslint-10-assignment-analysis',
      files: [
        'registry/nocobase-ai/providers/chat-provider.tsx',
        'registry/nocobase-mail/components/mail-api.ts',
      ],
      rules: {
        // ESLint 10 reports these values as unused even though they are read
        // after the async/loop assignment in the same function.
        'no-useless-assignment': 'off',
      },
    },
    {
      name: 'app-template-default/browser-regression-script',
      files: ['tests/react-grab-picker-regression.mjs'],
      languageOptions: {
        globals: {
          console: 'readonly',
          performance: 'readonly',
          URL: 'readonly',
        },
      },
    },
  ],
});
