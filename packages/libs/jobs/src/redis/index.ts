import type { ResolvedRedisScheduleExecutorConfig } from '../config.js';
import { BackendScheduleExecutor } from '../executor.js';
import type { ScheduleExecuteServiceDependencies } from '../service.js';
import type { ScheduleExecutor } from '../types.js';
import {
  defaultRedisFactories,
  RedisScheduleBackend,
  type RedisScheduleBackendFactories,
} from './backend.js';

export function createRedisScheduleExecutor(
  config: ResolvedRedisScheduleExecutorConfig,
  dependencies: Pick<ScheduleExecuteServiceDependencies, 'logger'>,
  factories: RedisScheduleBackendFactories = defaultRedisFactories,
): ScheduleExecutor {
  return new BackendScheduleExecutor(
    new RedisScheduleBackend(config, dependencies.logger, factories),
    dependencies.logger,
  );
}
