import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import vitestPlugin from '@vitest/eslint-plugin';
import type { ESLint, Linter } from 'eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const allFiles: string[] = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
const typescriptFiles: string[] = ['**/*.{ts,tsx,mts,cts}'];
const reactFiles: string[] = ['**/*.{js,jsx,ts,tsx}'];
const testFiles: string[] = [
  '**/*.{test,spec}.{js,jsx,ts,tsx,mts,cts}',
  '**/{test,tests}/**/*.{js,mjs,cjs,ts,tsx,mts,cts}',
  '**/e2e/**/*.{js,mjs,cjs,ts,tsx,mts,cts}',
];
const toolingFiles: string[] = [
  '**/*.{config,setup}.{ts,mts,cts}',
  '**/scripts/**/*.{ts,mts,cts}',
];
const portalClientFiles: string[] = [
  'client/**/*.{js,jsx,ts,tsx}',
  'registry/**/*.{js,jsx,ts,tsx}',
  'tests/**/*.{js,jsx,ts,tsx}',
];
const portalNodeFiles: string[] = [
  '*.{js,mjs,cjs}',
  'server/**/*.{js,mjs,cjs,ts,tsx,mts,cts}',
  'scripts/**/*.{js,mjs,cjs,ts,tsx,mts,cts}',
  '*.config.{js,mjs,cjs,ts,mts,cts}',
];
const defaultIgnores: string[] = [
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/generated/**',
  '**/playwright-report/**',
  '**/test-results/**',
];

const scopeConfigs = (
  configs: Linter.Config[],
  files: string[],
): Linter.Config[] => configs.map((config) => ({ ...config, files }));

const nameConfigs = (
  configs: Linter.Config[],
  namespace: string,
  files: string[] = allFiles,
): Linter.Config[] =>
  configs.map((config, index) => ({
    ...config,
    name: `${namespace}/${index + 1}`,
    files: config.files ?? files,
  }));

interface ConfigWithLanguageOptions extends Linter.Config {
  languageOptions?: Linter.LanguageOptions;
}

const reactRecommended: ConfigWithLanguageOptions =
  eslintReact.configs.recommended;
const hooksRecommended: Linter.Config =
  reactHooks.configs.flat?.recommended ?? reactHooks.configs.recommended;
const reactHooksPlugin: ESLint.Plugin = {
  meta: reactHooks.meta,
  rules: reactHooks.rules,
};
const reactRefreshPlugin: ESLint.Plugin = {
  rules: reactRefresh.rules,
};
const vitestRecommended: ConfigWithLanguageOptions =
  vitestPlugin.configs.recommended;
const vitestEnvironment: ConfigWithLanguageOptions = vitestPlugin.configs.env;

export interface SharedConfigOptions {
  tsconfigRootDir?: string;
  ignores?: string[];
  rules?: Linter.Config['rules'];
  overrides?: Linter.Config[];
  environment?: Linter.Config[];
}

export const base: Linter.Config[] = [
  {
    ...js.configs.recommended,
    name: '@nocobase/dev-config/base',
    files: allFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.es2024,
    },
  },
];

export const typescript: Linter.Config[] = nameConfigs(
  tseslint.configs.recommended,
  '@nocobase/dev-config/typescript',
  typescriptFiles,
);

export const typeChecked: Linter.Config[] = [
  ...nameConfigs(
    tseslint.configs.recommendedTypeChecked,
    '@nocobase/dev-config/type-checked',
    typescriptFiles,
  ),
  {
    name: '@nocobase/dev-config/project-service',
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    name: '@nocobase/dev-config/typescript-rules',
    files: typescriptFiles,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/require-await': 'off',
    },
  },
];

export const node: Linter.Config[] = [
  {
    name: '@nocobase/dev-config/node',
    files: allFiles,
    languageOptions: {
      globals: {
        ...globals.es2024,
        ...globals.node,
      },
    },
  },
];

export const react: Linter.Config[] = [
  {
    ...reactRecommended,
    name: '@nocobase/dev-config/react',
    files: reactFiles,
    languageOptions: {
      ...reactRecommended.languageOptions,
      globals: {
        ...reactRecommended.languageOptions?.globals,
        ...globals.browser,
      },
    },
    plugins: {
      ...reactRecommended.plugins,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      ...reactRecommended.rules,
      ...hooksRecommended.rules,
      '@eslint-react/no-context-provider': 'off',
      '@eslint-react/no-use-context': 'off',
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
    },
  },
];

export const vitest: Linter.Config[] = [
  {
    ...vitestRecommended,
    name: '@nocobase/dev-config/vitest',
    files: testFiles,
    languageOptions: {
      ...vitestEnvironment.languageOptions,
      ...vitestRecommended.languageOptions,
      globals: {
        ...vitestEnvironment.languageOptions?.globals,
        ...vitestRecommended.languageOptions?.globals,
      },
    },
    rules: {
      ...vitestRecommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-expect': 'off',
    },
  },
];

const createConfig = ({
  tsconfigRootDir = process.cwd(),
  ignores = [],
  environment = [],
  rules = {},
  overrides = [],
}: SharedConfigOptions): Linter.Config[] => [
  {
    name: '@nocobase/dev-config/ignores',
    ignores: [...defaultIgnores, ...ignores],
  },
  ...base,
  ...typeChecked,
  {
    name: '@nocobase/dev-config/project-root',
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
  },
  ...environment,
  ...vitest,
  {
    ...tseslint.configs.disableTypeChecked,
    name: '@nocobase/dev-config/untyped-support-files',
    files: [...testFiles, ...toolingFiles],
  },
  {
    name: '@nocobase/dev-config/local-rules',
    files: allFiles,
    rules,
  },
  ...overrides,
  {
    ...eslintConfigPrettier,
    name: '@nocobase/dev-config/prettier-compatibility',
    rules: {
      ...eslintConfigPrettier.rules,
      quotes: [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      'jsx-quotes': ['error', 'prefer-single'],
    },
  },
];

export const createNodeLibraryConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[] = (options = {}) =>
  createConfig({
    ...options,
    environment: [...node, ...(options.environment ?? [])],
  });

export const createClientLibraryConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[] = (options = {}) =>
  createConfig({
    ...options,
    environment: [
      ...react,
      ...scopeConfigs(node, portalNodeFiles),
      ...(options.environment ?? []),
    ],
  });

export const createPortalConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[] = (options = {}) =>
  createConfig({
    ...options,
    environment: [
      ...scopeConfigs(react, portalClientFiles),
      ...scopeConfigs(node, portalNodeFiles),
      ...(options.environment ?? []),
    ],
  });
