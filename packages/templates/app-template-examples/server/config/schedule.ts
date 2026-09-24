import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppScheduleConfig } from '@nocobase/app-server/schedule';

/**
 * Configurations the schedule service can run on. None is the default: until `schedule.default` names one, executors
 * run on the built-in memory adapter under storage/schedule, which serves one process on one host and is reported at
 * startup outside development. Name `memory` to keep that choice without the report, or `redis` to run any number of
 * instances with each firing executed once.
 */
const schedule: AppConfigFactory<AppScheduleConfig> = defineAppConfig(
  ({ paths }) => ({
    memory: {
      adapter: 'memory',
      persistence: { path: paths.storage('schedule') },
    },
    redis: {
      adapter: 'redis',
      connection: { host: '127.0.0.1', port: 6379, db: 0 },
      // Every firing leaves a finished job behind; keep the history bounded.
      removeOnComplete: { count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  }),
);

export default schedule;
