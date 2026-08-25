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
  ignores: ['public/r/**'],
  overrides: [
    {
      name: 'crm/migration-project',
      files: ['server/migrations/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'crm/async-jsx-handlers',
      files: [
        'client/**/*.{ts,tsx}',
        'registry/**/*.{ts,tsx}',
        'server/**/*.{ts,tsx}',
      ],
      ignores: ['**/tests/**', '**/*.{test,spec}.{ts,tsx}'],
      plugins: typescriptPlugins,
      rules: {
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      },
    },
    {
      name: 'crm/dynamic-contract-boundaries',
      files: [
        'client/components/ui/chart.tsx',
        'client/extensions/nocobase-acl/components/role-switcher.tsx',
        'client/extensions/nocobase-ai/components/page-elements/page-element-provider.tsx',
        'client/extensions/nocobase-ai/providers/form-registry.tsx',
        'client/extensions/nocobase-i18n/components/language-switcher.tsx',
        'client/extensions/nocobase-mail/components/mail-api.ts',
        'client/extensions/nocobase-mail/components/use-mail-messages.ts',
      ],
      plugins: typescriptPlugins,
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
    {
      name: 'crm/dynamic-string-normalization',
      files: [
        'client/components/resources/resource-label.ts',
        'client/extensions/nocobase-ai/components/chat/work-context-chip.tsx',
        'client/extensions/nocobase-ai/providers/chat-provider.tsx',
        'client/extensions/nocobase-ai/providers/sub-agent-stream.ts',
        'client/extensions/nocobase-ai/providers/ui-message-stream.ts',
        'client/extensions/nocobase-ai/providers/use-chat-attachments.ts',
        'client/extensions/nocobase-ai/services/nocobase-ai-service.ts',
        'client/extensions/nocobase-error-boundary/error-diagnostics.ts',
        'client/extensions/nocobase-i18n/components/language-switcher.tsx',
      ],
      plugins: typescriptPlugins,
      rules: {
        '@typescript-eslint/no-base-to-string': 'off',
      },
    },
    {
      name: 'crm/react-compiler-incremental-adoption',
      files: [
        'client/**/*.{js,jsx,ts,tsx}',
        'registry/**/*.{js,jsx,ts,tsx}',
        'tests/**/*.{js,jsx,ts,tsx}',
      ],
      plugins: reactPlugins,
      rules: {
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
        'react-refresh/only-export-components': 'off',
      },
    },
    {
      name: 'crm/intentional-hook-stability',
      files: [
        'client/components/auth/auto-redirect-provider.tsx',
        'client/extensions/nocobase-client/remote-select.tsx',
      ],
      plugins: reactPlugins,
      rules: {
        'react-hooks/exhaustive-deps': 'off',
      },
    },
    {
      name: 'crm/eslint-10-assignment-analysis',
      files: [
        'client/extensions/nocobase-ai/providers/chat-provider.tsx',
        'client/extensions/nocobase-mail/components/mail-api.ts',
      ],
      rules: {
        'no-useless-assignment': 'off',
      },
    },
    {
      name: 'crm/browser-regression-script',
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
