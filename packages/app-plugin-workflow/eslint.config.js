import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      name: 'workflow-plugin/migrated-engine-compatibility',
      files: ['engine/**/*.ts', 'tests/workflow-*.test.ts'],
      rules: {
        // The engine predates the shared type-aware lint preset. Keep its
        // existing runtime behavior while it moves into the plugin boundary;
        // these rules can be adopted incrementally in focused changes.
        '@typescript-eslint/no-base-to-string': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/only-throw-error': 'off',
        '@typescript-eslint/prefer-as-const': 'off',
        '@typescript-eslint/unbound-method': 'off',
        'no-empty': 'off',
        'no-useless-assignment': 'off',
        'preserve-caught-error': 'off',
      },
    },
    {
      name: 'workflow-plugin/database-migrations',
      files: ['database/migrations/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'workflow-plugin/database-value-normalization',
      files: ['server/services/workflow.ts'],
      rules: {
        // Database rows are unknown-valued records. This adapter deliberately
        // normalizes their scalar values at the HTTP service boundary.
        '@typescript-eslint/no-base-to-string': 'off',
      },
    },
  ],
});
