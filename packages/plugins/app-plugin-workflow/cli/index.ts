import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import WorkflowBuild from './build.ts';
import WorkflowCheck from './check.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-workflow',
  topic: 'workflow',
  description: 'Validate and build source-managed workflows.',
  commands: {
    check: WorkflowCheck,
    build: WorkflowBuild,
  },
  /**
   * An application whose workflows are managed as source has to turn them into Artifacts before either its build or
   * its dev run can load them. Registering that here rather than writing it into each application's build script is
   * what keeps it correct: the step belongs to this plugin, appears only where this plugin is installed, and moves
   * with it when it is removed.
   *
   * The build stage is `afterServerBuild` because `--resource-root` reads the compiled `.js` a deployment runs, which
   * `tsc` has only just produced. The dev run has no compiled output and reads the sources directly, so it passes no
   * resource root at all.
   */
  buildHooks: {
    afterServerBuild: [
      {
        label: 'Build workflow artifacts',
        command: [
          'pnpm',
          'nocobase',
          'workflow',
          'build',
          '--resource-root',
          './dist/server/workflows',
        ],
      },
    ],
  },
  devHooks: {
    beforeDev: [
      {
        label: 'Build workflow artifacts',
        command: ['pnpm', 'nocobase', 'workflow', 'build'],
      },
    ],
  },
});

export default cliPlugin;
