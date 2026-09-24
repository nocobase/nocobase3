import type { ScheduleConfig } from './config.js';
import { createMemoryScheduleExecutor } from './memory/index.js';
import {
  createScheduleExecuteServiceWith,
  type ManagedScheduleExecuteService,
  type ScheduleExecuteServiceDependencies,
  type ScheduleExecutorFactory,
} from './service.js';

const unavailable =
  (adapter: string): ScheduleExecutorFactory =>
  () => {
    throw new Error(`The ${adapter} schedule adapter is not available.`);
  };

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
    memory: createMemoryScheduleExecutor,
    redis: unavailable('redis'),
  });
}
