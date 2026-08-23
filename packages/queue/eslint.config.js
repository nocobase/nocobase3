import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      // The registry accepts Job subclasses with arbitrary constructor
      // signatures; unknown[] is too narrow because constructor parameters are
      // checked contravariantly.
      files: ['src/types.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
});
