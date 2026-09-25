import path from 'node:path';
import { createAppCommands } from '@nocobase/app-cli';
import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

// Commands this application answers to under the `app` topic, so `info` is
// `pnpm nocobase app info`. The shared ones arrive as one map from the CLI
// package and are passed straight through. Add a command this application owns
// as its own file here and give it an entry below.
const appCommands: AppCliCommands = {
  ...createAppCommands({
    rootDir: path.resolve(import.meta.dirname, '..', '..'),
    publishing: true,
  }),
};

export default appCommands;
