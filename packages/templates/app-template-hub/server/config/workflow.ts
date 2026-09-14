import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { WorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server';
import { resolveWorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server';

const workflow: AppConfigFactory<WorkflowRuntimeConfig> = defineAppConfig(
  (runtime) =>
    resolveWorkflowRuntimeConfig(
      {
        sourceRoot: runtime.configPaths.server('workflows'),
        distRoot: runtime.configPaths.server('workflows'),
        artifactDisk: 'local',
        production: runtime.env.NODE_ENV === 'production',
      },
      {
        rootDir: runtime.configPaths.root(),
        serverDir: runtime.configPaths.server(),
      },
    ),
);

export default workflow;
