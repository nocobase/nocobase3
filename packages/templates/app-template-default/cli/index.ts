#!/usr/bin/env node
import { runAppCli } from '@nocobase/nb3-cli/runtime';

import appCommands from './commands/index.js';
import cliPlugins from './plugins.js';

await runAppCli({ commands: appCommands, plugins: cliPlugins });
