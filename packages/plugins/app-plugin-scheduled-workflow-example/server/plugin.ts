import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const scheduledWorkflowExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-scheduled-workflow-example',
  schedules: { definitions: './server/schedules' },
});

export default scheduledWorkflowExamplePlugin;
