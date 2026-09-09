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
});

export default cliPlugin;
