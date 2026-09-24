import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ScheduleExecuteService } from '@nocobase/schedule';

/**
 * The application's schedule service. Each consumer asks it for an executor
 * of its own, under its package name as the scope.
 */
export const scheduleExecuteServiceToken: ServiceToken<ScheduleExecuteService> =
  createServiceToken<ScheduleExecuteService>('@nocobase/schedule/service');
