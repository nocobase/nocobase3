/** Connection contracts for the application-scoped BullMQ service. */
export interface QueueBackendConnections {
  redis: import('bullmq').ConnectionOptions;
  postgres: PostgresConnectionOptions;
  inMemory: Record<string, never>;
}

export type PostgresConnectionOptions =
  | string
  | (import('pg').PoolConfig & { schema?: string; skipVersionCheck?: boolean })
  | import('pg').Pool;

export type QueueConnectionOptions<B extends string> =
  B extends keyof QueueBackendConnections
    ? QueueBackendConnections[B]
    : unknown;

export type Channel = string;
export type JobIdProducer = (
  queue: string,
  channel: Channel,
  message: unknown,
) => string;

export interface RateLimitOptions {
  max: number;
  duration: number;
}

export interface QueueDefaults<B extends string = string> {
  namespace?: string;
  queueBackend?: B;
  connection?: QueueConnectionOptions<B>;
  concurrency?: number;
  rateLimit?: RateLimitOptions | null;
  removeOnComplete?: import('bullmq').JobsOptions['removeOnComplete'];
  removeOnFail?: import('bullmq').JobsOptions['removeOnFail'];
  attempts?: import('bullmq').JobsOptions['attempts'];
  backoff?: import('bullmq').JobsOptions['backoff'];
  jobIdProducer?: JobIdProducer;
}

export type QueueOverrides<B extends string = string> = Partial<
  QueueDefaults<B>
>;

export interface QueueOptions<
  B extends string = string,
> extends QueueDefaults<B> {
  queues?: Record<string, QueueOverrides>;
  setupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  cancellationGraceMs?: number;
}

export type QueueLocalRuntimeOptions = Pick<
  QueueDefaults,
  | 'concurrency'
  | 'removeOnComplete'
  | 'removeOnFail'
  | 'attempts'
  | 'backoff'
  | 'jobIdProducer'
>;

export type QueueRuntimeOptions = QueueLocalRuntimeOptions & {
  rateLimit?: RateLimitOptions | null;
};

export interface PublishOptions {
  priority?: number;
  delay?: number;
  attempts?: import('bullmq').JobsOptions['attempts'];
  backoff?: import('bullmq').JobsOptions['backoff'];
  removeOnComplete?: import('bullmq').JobsOptions['removeOnComplete'];
  removeOnFail?: import('bullmq').JobsOptions['removeOnFail'];
  jobIdProducer?: JobIdProducer;
}

export interface ResolvedQueueConfiguration extends QueueDefaults {
  namespace: string;
  queueBackend: string;
  concurrency: number;
  attempts: number;
}

export interface QueueTimeoutOptions {
  setupTimeoutMs: number;
  shutdownTimeoutMs: number;
  cancellationGraceMs: number;
}
