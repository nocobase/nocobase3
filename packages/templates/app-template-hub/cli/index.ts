#!/usr/bin/env node
import { runAppCli } from '@nocobase/nb3-cli/runtime';

import appCommands from './commands/index.ts';
import cliPlugins from './plugins.ts';

// Assembles this application's CLI: the built-in `plugin *` commands, this
// application's own commands under `app`, and each registered plugin's
// commands under the topic it declares.
await runAppCli({
  commands: appCommands,
  plugins: cliPlugins,
});
