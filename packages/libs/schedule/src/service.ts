import {
  resolveScheduleExecutorConfig,
  selectScheduleConfig,
  type ResolvedScheduleExecutorConfig,
  type ScheduleConfig,
} from './config.js';
import type {
  ScheduleExecuteService,
  ScheduleExecutor,
  ScheduleExecutorOverrides,
  ScheduleLogger,
} from './types.js';
import { assertValidScope } from './validation.js';

/** Reports that an executor runs on the built-in memory configuration. */
export interface ScheduleFallbackEvent {
  readonly scope: string;
  /** The configuration key the consumer asked for, when it named one. */
  readonly name?: string;
}

/**
 * What the application supplies. The package reads neither application
 * settings nor the process environment itself.
 */
export interface ScheduleExecuteServiceDependencies {
  /** The namespace of every configuration that sets none. */
  readonly appName: string;
  /** Where memory configurations without `persistence.path` keep their state. */
  readonly storagePath: string;
  readonly logger?: ScheduleLogger;
  /**
   * Called once for each executor created on the built-in memory
   * configuration, which runs on one host only.
   */
  readonly onFallback?: (event: ScheduleFallbackEvent) => void;
}

/** The service as its owner holds it: consumers see `ScheduleExecuteService`. */
export interface ManagedScheduleExecuteService extends ScheduleExecuteService {
  /** Shuts every executor down. Safe to call more than once. */
  shutdown(): Promise<void>;
}

export type ScheduleExecutorFactory = (
  config: ResolvedScheduleExecutorConfig,
  dependencies: ScheduleExecuteServiceDependencies,
) => ScheduleExecutor;

export interface ScheduleExecutorFactories {
  readonly memory: ScheduleExecutorFactory;
  readonly redis: ScheduleExecutorFactory;
}

interface ExecutorEntry {
  readonly executor: ScheduleExecutor;
  readonly config: ResolvedScheduleExecutorConfig;
}

export function createScheduleExecuteServiceWith(
  config: ScheduleConfig | undefined,
  dependencies: ScheduleExecuteServiceDependencies,
  factories: ScheduleExecutorFactories,
): ManagedScheduleExecuteService {
  const executors = new Map<string, ExecutorEntry>();
  let shutdownPromise: Promise<void> | undefined;

  return {
    getScheduleExecutor(
      scope: string,
      name?: string,
      overrides?: ScheduleExecutorOverrides,
    ): ScheduleExecutor {
      if (shutdownPromise) {
        throw new Error('The schedule service has been shut down.');
      }
      assertValidScope(scope);
      const selection = selectScheduleConfig(config, name);
      const resolved = resolveScheduleExecutorConfig(
        selection,
        scope,
        overrides,
        dependencies,
      );
      // A scope and a configuration key identify one queue, so they identify
      // one executor: two would compete for the same firings under two sets of
      // execution settings.
      const identity = JSON.stringify([selection.key, scope]);
      const existing = executors.get(identity);
      if (existing) {
        if (
          existing.config.concurrency !== resolved.concurrency ||
          existing.config.attempts !== resolved.attempts
        ) {
          throw new Error(
            `The schedule executor for scope "${scope}" already exists with different overrides (concurrency ${existing.config.concurrency}, attempts ${existing.config.attempts}).`,
          );
        }
        return existing.executor;
      }
      const executor = factories[resolved.adapter](resolved, dependencies);
      executors.set(identity, { executor, config: resolved });
      if (resolved.builtIn) {
        dependencies.onFallback?.({
          scope,
          ...(name !== undefined ? { name } : {}),
        });
      }
      return executor;
    },

    shutdown(): Promise<void> {
      shutdownPromise ??= Promise.allSettled(
        [...executors.values()].map((entry) => entry.executor.shutdown()),
      ).then((results) => {
        const failures = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason as unknown] : [],
        );
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            'Some schedule executors failed to shut down.',
          );
        }
      });
      return shutdownPromise;
    },
  };
}
