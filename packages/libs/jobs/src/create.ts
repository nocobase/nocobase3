import type { ScheduleConfig } from './config.js';
import { createMemoryScheduleExecutor } from './memory/index.js';
import { createRedisScheduleExecutor } from './redis/index.js';
import {
  createScheduleExecuteServiceWith,
  type ManagedScheduleExecuteService,
  type ScheduleExecuteServiceDependencies,
} from './service.js';

/**
 * Creates the schedule service for one application. `config` is the
 * application's `schedule` section; `dependencies` carry what the package
 * would otherwise have to read from the application.
 */
export function createScheduleExecuteService(
  config: ScheduleConfig | undefined,
  dependencies: ScheduleExecuteServiceDependencies,
): ManagedScheduleExecuteService {
  return createScheduleExecuteServiceWith(config, dependencies, {
    memory: (resolved, { logger }) =>
      createMemoryScheduleExecutor(resolved, { logger }),
    redis: (resolved, { logger }) =>
      createRedisScheduleExecutor(resolved, { logger }),
  });
}
