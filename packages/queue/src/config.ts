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
    throw new Error(`Default queue connection "${config.default}" is not configured.`);
  }
}
