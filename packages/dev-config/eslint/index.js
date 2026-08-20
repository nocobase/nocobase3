import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import vitestPlugin from "@vitest/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const allFiles = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];
const reactFiles = ["**/*.{js,jsx,ts,tsx}"];
const testFiles = [
  "**/*.{test,spec}.{js,jsx,ts,tsx,mts,cts}",
  "**/{test,tests}/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
  "**/e2e/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
];
const toolingFiles = [
  "**/*.{config,setup}.{ts,mts,cts}",
  "**/scripts/**/*.{ts,mts,cts}",
];
const portalClientFiles = [
  "client/**/*.{js,jsx,ts,tsx}",
  "registry/**/*.{js,jsx,ts,tsx}",
  "tests/**/*.{js,jsx,ts,tsx}",
];
const portalNodeFiles = [
  "*.{js,mjs,cjs}",
  "server/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
  "scripts/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
  "*.config.{js,mjs,cjs,ts,mts,cts}",
];
const defaultIgnores = [
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/generated/**",
  "**/playwright-report/**",
  "**/test-results/**",
];

const scopeConfigs = (configs, files) =>
  configs.map((config) => ({ ...config, files }));

const nameConfigs = (configs, namespace, files = allFiles) =>
  configs.map((config, index) => ({
    ...config,
    name: `${namespace}/${index + 1}`,
    files: config.files ?? files,
  }));

const reactRecommended = eslintReact.configs.recommended;
const hooksRecommended =
  reactHooks.configs.flat?.recommended ?? reactHooks.configs.recommended;
const vitestRecommended = vitestPlugin.configs.recommended;
const vitestEnvironment = vitestPlugin.configs.env;

export const base = [
  {
    ...js.configs.recommended,
    name: "@nocobase/dev-config/base",
    files: allFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.es2024,
    },
  },
];

export const typescript = nameConfigs(
  tseslint.configs.recommended,
  "@nocobase/dev-config/typescript",
  typescriptFiles,
);

export const typeChecked = [
  ...nameConfigs(
    tseslint.configs.recommendedTypeChecked,
    "@nocobase/dev-config/type-checked",
    typescriptFiles,
  ),
  {
    name: "@nocobase/dev-config/project-service",
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    name: "@nocobase/dev-config/typescript-rules",
    files: typescriptFiles,
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
    },
  },
];

export const node = [
  {
    name: "@nocobase/dev-config/node",
    files: allFiles,
    languageOptions: {
      globals: {
        ...globals.es2024,
        ...globals.node,
      },
    },
  },
];

export const react = [
  {
    ...reactRecommended,
    name: "@nocobase/dev-config/react",
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
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactRecommended.rules,
      ...hooksRecommended.rules,
      "@eslint-react/no-context-provider": "off",
      "@eslint-react/no-use-context": "off",
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
    },
  },
];

export const vitest = [
  {
    ...vitestRecommended,
    name: "@nocobase/dev-config/vitest",
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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "vitest/expect-expect": "off",
      "vitest/no-conditional-expect": "off",
    },
  },
];

const createConfig = ({
  tsconfigRootDir = process.cwd(),
  ignores = [],
  environment = [],
  rules = {},
  overrides = [],
}) => [
  {
    name: "@nocobase/dev-config/ignores",
    ignores: [...defaultIgnores, ...ignores],
  },
  ...base,
  ...typeChecked,
  {
    name: "@nocobase/dev-config/project-root",
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
    name: "@nocobase/dev-config/untyped-support-files",
    files: [...testFiles, ...toolingFiles],
  },
  {
    name: "@nocobase/dev-config/local-rules",
    files: allFiles,
    rules,
  },
  ...overrides,
  {
    ...eslintConfigPrettier,
    name: "@nocobase/dev-config/prettier-compatibility",
  },
];

export const createNodeLibraryConfig = (options = {}) =>
  createConfig({
    ...options,
    environment: [...node, ...(options.environment ?? [])],
  });

export const createClientLibraryConfig = (options = {}) =>
  createConfig({
    ...options,
    environment: [
      ...react,
      ...scopeConfigs(node, portalNodeFiles),
      ...(options.environment ?? []),
    ],
  });

export const createPortalConfig = (options = {}) =>
  createConfig({
    ...options,
    environment: [
      ...scopeConfigs(react, portalClientFiles),
      ...scopeConfigs(node, portalNodeFiles),
      ...(options.environment ?? []),
    ],
  });
