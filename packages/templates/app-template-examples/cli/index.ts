#!/usr/bin/env node
import { runAppCli } from '@nocobase/nb3-cli/runtime';
import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import appCommands from './commands/index.js';
import cliPlugins from './plugins.js';

// Assembles this application's CLI: the built-in `plugin *` commands, this application's own commands under `app`, and
// each registered plugin's commands under the topic it declares.
//
// Development adds the commands under `cli/dev-commands/`, which read client declarations through Vite and the browser
// client — neither of which exists in a server deployment, since `pnpm build` emits the server half alone. Running
// from source is what distinguishes the two: a build emits `.js`.
//
// The specifier is assembled at run time so the compiler does not follow it. A literal would pull `dev-commands` into
// the server build no matter what `exclude` says, and that build cannot resolve what those commands import.
const runningFromSource = import.meta.filename.endsWith('.ts');
const devCommands: AppCliCommands = runningFromSource
  ? (
      (await import(`${'./dev-commands'}/index.js`)) as {
        default: AppCliCommands;
      }
    ).default
  : {};

await runAppCli({
  commands: { ...appCommands, ...devCommands },
  plugins: cliPlugins,
});
