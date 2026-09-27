import type { ResolvedMemoryScheduleExecutorConfig } from '../config.js';
import { BackendScheduleExecutor } from '../executor.js';
import type { ScheduleExecuteServiceDependencies } from '../service.js';
import type { ScheduleExecutor } from '../types.js';
import { InMemoryScheduleBackend } from './backend.js';

export function createMemoryScheduleExecutor(
  config: ResolvedMemoryScheduleExecutorConfig,
  dependencies: Pick<ScheduleExecuteServiceDependencies, 'logger'>,
): ScheduleExecutor {
  return new BackendScheduleExecutor(
    new InMemoryScheduleBackend(config, dependencies.logger),
    dependencies.logger,
  );
}
