import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import CliExampleArtifactBuild from './artifact-build.ts';
import CliExampleGreet from './greet.ts';

/**
 * Commands are imported statically: a command module is a class declaration and costs nothing to load. Whatever a
 * command actually needs to do its work is loaded inside its own `run()`.
 *
 * The keys are sub-command names. `greet` becomes `nocobase demo greet`, and the colon in `artifact:build` nests one
 * level further, into `nocobase demo artifact build`.
 */
const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-cli-example',
  topic: 'demo',
  description: 'Example commands contributed by a plugin.',
  commands: {
    greet: CliExampleGreet,
    'artifact:build': CliExampleArtifactBuild,
  },
  /**
   * A plugin may also ask an application to run a command during `pnpm build` or `pnpm dev`, which is how a plugin
   * that has to produce something before the application starts avoids writing that step into every application's
   * build script.
   *
   * A hook command is any executable with its arguments, already split — not necessarily one of this plugin's own
   * commands, and not a string a shell would parse. So there is no quoting to get right, and no `&&` or pipes: a
   * sequence is several hooks, which run in the order they are declared.
   *
   * The stage names say what exists when the hook runs. `beforeBuild` has an empty `dist`, `afterClientBuild` has
   * `dist/client`, `afterServerBuild` adds `dist/server`, and `afterBuild` sees the installed deployment tree.
   * `beforeDev` is the only dev stage, because `pnpm dev` starts concurrent processes rather than finishing steps.
   */
  buildHooks: {
    beforeBuild: [
      {
        label: 'Announce the example build hook',
        command: [
          'node',
          '-e',
          "console.log('cli-example: beforeBuild hook ran')",
        ],
      },
    ],
  },
});

export default cliPlugin;
