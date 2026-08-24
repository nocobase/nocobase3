import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      // The database query-builder callbacks expose methods that are safe to
      // call unbound, but their upstream types do not annotate `this: void`.
      files: ['src/domain.ts'],
      rules: { '@typescript-eslint/unbound-method': 'off' },
    },
    {
      // LiquidJS declares rendered output as `any`; runtime output limits and
      // validation in this module narrow it to strings before returning it.
      files: ['src/templates/index.ts'],
      rules: { '@typescript-eslint/no-unsafe-argument': 'off' },
    },
  ],
});
