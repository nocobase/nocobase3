import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { configureWorkflowClient } from './workflow-management/runtime.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient }) => {
  configureWorkflowClient(appClient);
};

export default bootstrap;
