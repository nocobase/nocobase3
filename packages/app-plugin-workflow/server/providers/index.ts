import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { WorkflowProvider, type WorkflowProviderConfig } from './workflow.js';

const providers: readonly AppPluginProviderConstructor<WorkflowProviderConfig>[] =
  [WorkflowProvider];

export default providers;
