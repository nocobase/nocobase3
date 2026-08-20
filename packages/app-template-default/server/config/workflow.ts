import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';

import type { AppWorkflowConfig } from './types.js';

const workflowConfig: ConfigFactory<AppWorkflowConfig> = defineConfig(({ paths }): AppWorkflowConfig => ({
  sourceRoot: paths.server('workflows'),
}));

export default workflowConfig;
