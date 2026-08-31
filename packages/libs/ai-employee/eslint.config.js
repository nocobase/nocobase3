import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // This migration preserves a large legacy runtime-neutral implementation.
  // Its existing type-aware lint debt is tracked separately from package split.
  ignores: ['dist/**', 'src/**'],
});
