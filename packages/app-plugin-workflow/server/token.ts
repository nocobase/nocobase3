import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { WorkflowService } from './runtime/runtime.js';

export const workflowServiceToken: ServiceToken<WorkflowService> =
  createServiceToken<WorkflowService>('@nocobase/app-plugin-workflow/service');
