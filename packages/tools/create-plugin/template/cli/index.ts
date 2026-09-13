import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import PluginInfo from './info.ts';

/**
 * Commands are imported statically: a command module is a class declaration and costs nothing to load. Whatever a
 * command needs to do its work is loaded inside its own `run()`, so `--help` stays fast.
 *
 * Each key is the sub-command name under this plugin's topic, so `info` answers to `nocobase <topic> info`. A colon
 * nests one level further: `'artifact:build'` becomes `nocobase <topic> artifact build`.
 *
 * A plugin may also register commands for an application to run during `pnpm build` or `pnpm dev`, through
 * `buildHooks` and `devHooks`. Use them when the plugin has to produce something before the application can start,
 * rather than asking every application to add the step to its own build script. See
 * `internal-docs/development/plugin-development/cli.md`.
 */
const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
  topic: __NOCOBASE_CLI_TOPIC_LITERAL__,
  description: __NOCOBASE_CLI_DESCRIPTION_LITERAL__,
  commands: {
    info: PluginInfo,
  },
});

export default cliPlugin;
