import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { JobDispatchRegistry } from './schedules/job-target.js';
import type { ScheduleTargetRegistry } from './schedules/registry.js';
import type { ScheduleOccurrenceStore } from './occurrences.js';
import type { ScheduleStore } from './store.js';

export interface SchedulerService {
  list(): Promise<readonly ScheduleListItem[]>;
  listOccurrences(
    scheduleId: string,
  ): ReturnType<ScheduleStore['listOccurrences']>;
  sync(finalize?: boolean): Promise<void>;
}

export interface SchedulerStartupMode {
  readonly kind: 'sync-only';
  readonly finalize: boolean;
}

export type ScheduleListItem = Awaited<
  ReturnType<ScheduleStore['list']>
>[number] & {
  readonly targetSummary: import('./schedules/registry.js').ScheduleTargetSummary;
};

export const schedulerServiceToken: ServiceToken<SchedulerService> =
  createServiceToken<SchedulerService>(
    '@nocobase/app-plugin-scheduler/service',
  );

export const scheduleTargetRegistryToken: ServiceToken<ScheduleTargetRegistry> =
  createServiceToken<ScheduleTargetRegistry>(
    '@nocobase/app-plugin-scheduler/targets',
  );
export const jobDispatchRegistryToken: ServiceToken<JobDispatchRegistry> =
  createServiceToken<JobDispatchRegistry>(
    '@nocobase/app-plugin-scheduler/jobs',
  );
export const scheduleStoreToken: ServiceToken<ScheduleStore> =
  createServiceToken<ScheduleStore>('@nocobase/app-plugin-scheduler/store');
export const scheduleOccurrenceStoreToken: ServiceToken<ScheduleOccurrenceStore> =
  createServiceToken<ScheduleOccurrenceStore>(
    '@nocobase/app-plugin-scheduler/occurrence-store',
  );
export const schedulerStartupModeToken: ServiceToken<SchedulerStartupMode> =
  createServiceToken<SchedulerStartupMode>(
    '@nocobase/app-plugin-scheduler/startup-mode',
  );
