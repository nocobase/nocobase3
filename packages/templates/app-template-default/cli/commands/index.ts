import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import commands from '../standard-commands.js';

// Commands this application answers to under the `app` topic, so `info` is
// `pnpm nocobase app info`. The shared ones arrive as one map from the CLI
// package and are passed straight through: re-exporting each of them from its
// own file added a place to forget, and forgetting it makes a command answer to
// nothing. Add a command this application owns as its own file here and give
// it an entry below.
const appCommands: AppCliCommands = {
  ...commands,
};

export default appCommands;
