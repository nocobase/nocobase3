import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApprovalExampleService } from './lab/service.js';

export const approvalExampleServiceToken: ServiceToken<ApprovalExampleService> =
  createServiceToken<ApprovalExampleService>(
    '@nocobase/app-plugin-approval-example/service',
  );
