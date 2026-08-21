import type { DatabaseManager } from '@nocobase/database';
import type { Job } from '@boringnode/queue';
import type {
  DispatchManyResult,
  DispatchResult,
  Duration,
  JobOptions,
  QueueConfig,
  RetryConfig,
  WorkerConfig,
} from '@boringnode/queue/types';

export type AppQueueConnectionConfig =
  | AppQueueSyncConnectionConfig
  | AppQueueFakeConnectionConfig
  | AppQueueRedisConnectionConfig
  | AppQueueDatabaseConnectionConfig;

export interface AppQueueSyncConnectionConfig {
  driver: 'sync';
}

export interface AppQueueFakeConnectionConfig {
  driver: 'fake';
}

export interface AppQueueRedisConnectionConfig {
  driver: 'redis';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
}

export interface AppQueueDatabaseConnectionConfig {
  driver: 'database';
  connection?: string;
  table?: string;
  schedulesTable?: string;
}

export interface AppQueueNamedQueueConfig extends Omit<QueueConfig, 'adapter'> {
  connection?: string;
}

export interface AppQueueWorkerConfig extends Omit<WorkerConfig, 'adapter'> {
  connection?: string;
  queues?: string[];
}

export interface AppQueueJobsConfig {
  locations?: string[];
  autoLoad?: boolean;
  hotReload?: boolean;
}

export interface AppQueueConfig {
  default: string;
  connections: Record<string, AppQueueConnectionConfig>;
  retry?: RetryConfig;
  defaultJobOptions?: JobOptions;
  queues?: Record<string, AppQueueNamedQueueConfig>;
  worker?: AppQueueWorkerConfig;
  jobs?: AppQueueJobsConfig;
}

export interface CreateQueueManagerOptions {
  database?: DatabaseManager;
  logger?: NocoBaseQueueLogger;
  jobFactory?: NocoBaseQueueJobFactory;
}

export type NocoBaseQueueJobClass<T extends Job = Job> = (new (
  ...args: any[]
) => T) & {
  options?: JobOptions;
  name: string;
};
export type NocoBaseQueueJobFactory = (
  JobClass: NocoBaseQueueJobClass,
) => Job | Promise<Job>;
export type NocoBaseQueueDispatchableJobClass<T extends Job = Job> =
  NocoBaseQueueJobClass<T> & {
    dispatch(payload: T extends Job<infer P> ? P : never): unknown;
    dispatchMany(payloads: Array<T extends Job<infer P> ? P : never>): unknown;
  };

export interface QueueDispatchOptions {
  queue?: string;
  connection?: string;
  priority?: number;
  delay?: Duration;
  groupId?: string;
  dedup?: {
    id: string;
    ttl?: Duration;
    extend?: boolean;
    replace?: boolean;
  };
}

export interface NocoBaseQueueWorker {
  readonly id: string;
  start(queues?: string[]): Promise<void>;
  stop(): Promise<void>;
}

export interface NocoBaseQueueManager {
  init(): Promise<void>;
  use(name?: string): unknown;
  registerJob<T extends Job>(JobClass: NocoBaseQueueJobClass<T>): void;
  dispatch<T extends Job>(
    JobClass: NocoBaseQueueDispatchableJobClass<T>,
    payload: T extends Job<infer P> ? P : never,
    options?: QueueDispatchOptions,
  ): Promise<DispatchResult>;
  dispatchMany<T extends Job>(
    JobClass: NocoBaseQueueDispatchableJobClass<T>,
    payloads: Array<T extends Job<infer P> ? P : never>,
    options?: Omit<QueueDispatchOptions, 'delay' | 'dedup'>,
  ): Promise<DispatchManyResult>;
  createWorker(options?: AppQueueWorkerConfig): NocoBaseQueueWorker;
  close(): Promise<void>;
}

export interface NocoBaseQueueLogger {
  trace?(obj: object, message?: string): void;
  debug?(obj: object, message?: string): void;
  info?(obj: object, message?: string): void;
  warn?(obj: object, message?: string): void;
  error?(obj: object, message?: string): void;
}
