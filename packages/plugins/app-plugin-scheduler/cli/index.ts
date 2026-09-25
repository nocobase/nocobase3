import { defineCliPlugin, type AppCliPlugin } from '@nocobase/app-cli/plugins';

import ScheduleSync from './sync.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-scheduler',
  description: 'Manage application schedules.',
  commands: { sync: ScheduleSync },
});

export default cliPlugin;
