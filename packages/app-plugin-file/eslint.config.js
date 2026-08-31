import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // Registry source and shipped Skill recipes are compiled by dedicated consumer configs.
  ignores: [
    'registry/**',
    'skills/**/reference/examples/**/*.ts',
    'skills/**/reference/examples/**/*.tsx',
  ],
});
