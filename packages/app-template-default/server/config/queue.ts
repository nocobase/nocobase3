import path from 'node:path';

import { defineConfig } from '@nocobase/app-server-kit/config';
import { createPluginJobLocations } from '@nocobase/app-server-kit/plugins';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import type { AppQueueConfig } from '@nocobase/queue';
import { withQueueJobLocations } from '@nocobase/queue';
import type {
  AppConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

const queueConfig: AppRuntimeConfigFactory<
  AppQueueConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppQueueConfig, DefaultAppConfigContext>(
  ({ env, paths, plugins }): AppQueueConfig =>
    withQueueJobLocations(
      {
        default: env.string('QUEUE_CONNECTION', 'sync'),

        connections: {
          sync: {
            driver: 'sync',
          },

          redis: {
            driver: 'redis',
            host: env.string('REDIS_HOST', '127.0.0.1'),
            port: env.number('REDIS_PORT', 6379),
            username: env.string('REDIS_USERNAME'),
            password: env.string('REDIS_PASSWORD'),
            db: env.number('REDIS_DB', 0),
            keyPrefix: env.string('QUEUE_REDIS_PREFIX', 'nocobase:queue:'),
            tls: env.boolean('REDIS_TLS', false),
          },

          database: {
            driver: 'database',
            connection: env.string('QUEUE_DB_CONNECTION'),
            table: env.string('QUEUE_TABLE', 'queue_jobs'),
            schedulesTable: env.string(
              'QUEUE_SCHEDULES_TABLE',
              'queue_schedules',
            ),
          },
        },

        worker: {
          connection: env.string('QUEUE_WORKER_CONNECTION'),
          queues: env.list('QUEUE_WORKER_QUEUES', ['default']),
          concurrency: env.number('QUEUE_WORKER_CONCURRENCY', 1),
          idleDelay: env.string('QUEUE_WORKER_IDLE_DELAY', '2s'),
          timeout: env.string('QUEUE_WORKER_TIMEOUT'),
        },

        jobs: {
          locations: [path.join(paths.server(), 'jobs/**/*.{ts,js}')],
          autoLoad: env.boolean('QUEUE_JOBS_AUTO_LOAD', true),
          hotReload: env.boolean(
            'QUEUE_JOBS_HOT_RELOAD',
            process.env.NODE_ENV === 'development',
          ),
        },
      },
      createPluginJobLocations(
        plugins?.plugins.map((plugin) => plugin.metadata) ?? [],
      ),
    ),
);

export default queueConfig;
