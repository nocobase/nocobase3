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
});

export default cliPlugin;
