import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // The shared preset ignores every `dist` directory. The `dist` command topic's sources live in one, and
  // tests/command-files.test.ts fails if they stop being linted.
  ignores: ['!src/commands/dist/', '!src/commands/dist/**'],
});
