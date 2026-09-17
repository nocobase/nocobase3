import type { AppQueueConfig } from './types.js';

export function createSyncQueueConfig(): AppQueueConfig {
  return {
    default: 'sync',
    connections: {
      sync: {
        driver: 'sync',
      },
    },
    worker: {
      queues: ['default'],
      concurrency: 1,
      idleDelay: '2s',
    },
    jobs: {
      locations: [],
      autoLoad: false,
      hotReload: false,
    },
  };
}

export function assertDefaultConnection(config: AppQueueConfig): void {
  if (!config.connections[config.default]) {
    throw new Error(
      `Default queue connection "${config.default}" is not configured.`,
    );
  }
}

export function withQueueJobLocations(
  config: AppQueueConfig,
  locations: readonly string[],
): AppQueueConfig {
  return {
    ...config,
    jobs: {
      ...config.jobs,
      locations: [...(config.jobs?.locations ?? []), ...locations],
    },
  };
}

/** Minimal executable RED seam; replaced by the pure resolver in T008. */
export function resolveQueueConfiguration(
  _options: unknown,
  _queue: string,
  _manual?: unknown,
): import('./types.js').ResolvedQueueConfiguration {
  throw new Error('Queue configuration resolver is not implemented');
}

export function resolvePublishOptions(
  _configuration: import('./types.js').ResolvedQueueConfiguration,
  _options?: unknown,
  _now?: number,
): import('./types.js').PublishOptions {
  throw new Error('Publish configuration resolver is not implemented');
}

export function resolveQueueTimeouts(
  _options: unknown,
): import('./types.js').QueueTimeoutOptions {
  throw new Error('Queue timeout resolver is not implemented');
}
