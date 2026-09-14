import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { JobDispatchRegistry } from './schedules/job-target.js';
import type { ScheduleTargetRegistry } from './schedules/registry.js';
import type { ScheduleExecutionReporter } from './schedules/registry.js';
import type { ScheduleOccurrenceStore } from './occurrences.js';
import type { ScheduleStore } from './store.js';

export interface SchedulerService {
  list(): Promise<readonly ScheduleListItem[]>;
  listOccurrences(
    scheduleId: string,
  ): Promise<readonly ScheduleOccurrenceView[]>;
  sync(finalize?: boolean): Promise<void>;
  setEnabled(scheduleId: string, enabled: boolean): Promise<ScheduleListItem>;
}

export type ScheduleOccurrenceView = Awaited<
  ReturnType<ScheduleStore['listOccurrences']>
>[number] & {
  readonly target: Awaited<
    ReturnType<ScheduleStore['listOccurrences']>
  >[number]['target'] & { readonly href?: string };
};

export interface SchedulerStartupMode {
  readonly kind: 'sync-only';
  readonly finalize: boolean;
}

export type ScheduleListItem = Awaited<
  ReturnType<ScheduleStore['list']>
>[number] & {
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
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
export const scheduleExecutionReporterToken: ServiceToken<ScheduleExecutionReporter> =
  createServiceToken<ScheduleExecutionReporter>(
    '@nocobase/app-plugin-scheduler/execution-reporter',
  );
export const schedulerStartupModeToken: ServiceToken<SchedulerStartupMode> =
  createServiceToken<SchedulerStartupMode>(
    '@nocobase/app-plugin-scheduler/startup-mode',
  );
