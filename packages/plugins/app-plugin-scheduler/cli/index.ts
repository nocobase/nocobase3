import { defineCliPlugin, type AppCliPlugin } from '@nocobase/nb3-cli/plugins';

import ScheduleSync from './sync.ts';

const cliPlugin: AppCliPlugin = defineCliPlugin({
  packageName: '@nocobase/app-plugin-scheduler',
  topic: 'schedule',
  description: 'Manage application schedules.',
  commands: { sync: ScheduleSync },
});

export default cliPlugin;
