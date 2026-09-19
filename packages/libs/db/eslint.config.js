import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // Knex deliberately exposes dynamic query-builder and schema boundaries.
  // Keep the rest of the type-aware preset enabled while these boundaries are
  // migrated to narrower public types incrementally.
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@nocobase/db-*'],
            message:
              'The database core must not import its dialect or testkit consumers. Use a test driver or move the test to its dialect.',
          },
        ],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    'prefer-rest-params': 'off',
  },
});
