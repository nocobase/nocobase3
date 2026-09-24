import type { ResolvedMemoryScheduleExecutorConfig } from '../config.js';
import { BackendScheduleExecutor } from '../executor.js';
import type { ScheduleExecuteServiceDependencies } from '../service.js';
import type { ScheduleExecutor } from '../types.js';
import {
  InMemoryScheduleBackend,
  type InMemoryScheduleBackendOptions,
} from './backend.js';

export function createMemoryScheduleExecutor(
  config: ResolvedMemoryScheduleExecutorConfig,
  dependencies: Pick<ScheduleExecuteServiceDependencies, 'logger'>,
  options: InMemoryScheduleBackendOptions = {},
): ScheduleExecutor {
  return new BackendScheduleExecutor(
    new InMemoryScheduleBackend(config, dependencies.logger, options),
    dependencies.logger,
  );
}
