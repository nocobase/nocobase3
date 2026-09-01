import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { WorkflowProvider, type WorkflowProviderConfig } from './workflow.js';

const serviceProviders: readonly AppPluginProviderConstructor<WorkflowProviderConfig>[] =
  [WorkflowProvider];

export default serviceProviders;
