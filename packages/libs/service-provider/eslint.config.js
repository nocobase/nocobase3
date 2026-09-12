import { createUniversalLibraryConfig } from '@nocobase/dev-config/eslint';

export default createUniversalLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
});
