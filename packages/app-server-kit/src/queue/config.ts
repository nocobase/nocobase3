import path from 'node:path';
import type { AppQueueConfig } from '@nocobase/queue';
import { Type } from '@sinclair/typebox';

import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type AppConfigDefinition,
} from '../config/index.js';
import { createPluginJobLocations } from '../plugins/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export const queueConfig: AppConfigDefinition<
  AppQueueConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig<AppQueueConfig>()({
  namespace: 'queue',
  schema: Type.Object({
    default: Type.String(),
    connections: Type.Record(
      Type.String(),
      Type.Object(
        {
          driver: Type.String(),
          host: Type.Optional(Type.String()),
          port: Type.Optional(Type.Number()),
          username: Type.Optional(Type.String()),
          password: Type.Optional(Type.String()),
          db: Type.Optional(Type.Number()),
          keyPrefix: Type.Optional(Type.String()),
          tls: Type.Optional(Type.Boolean()),
          connection: Type.Optional(Type.String()),
          table: Type.Optional(Type.String()),
          schedulesTable: Type.Optional(Type.String()),
        },
        { additionalProperties: true },
      ),
    ),
    retry: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    defaultJobOptions: Type.Optional(
      Type.Record(Type.String(), Type.Unknown()),
    ),
    queues: Type.Optional(
      Type.Record(
        Type.String(),
        Type.Object({}, { additionalProperties: true }),
      ),
    ),
    worker: Type.Optional(
      Type.Object(
        {
          connection: Type.Optional(Type.String()),
          queues: Type.Optional(Type.Array(Type.String())),
          concurrency: Type.Optional(Type.Number({ minimum: 1 })),
          idleDelay: Type.Optional(
            Type.Union([Type.Number({ minimum: 0 }), Type.String()]),
          ),
          timeout: Type.Optional(
            Type.Union([Type.Number({ minimum: 0 }), Type.String()]),
          ),
        },
        { additionalProperties: true },
      ),
    ),
    jobs: Type.Optional(
      Type.Object({
        locations: Type.Optional(Type.Array(Type.String())),
        autoLoad: Type.Optional(Type.Boolean()),
        hotReload: Type.Optional(Type.Boolean()),
      }),
    ),
  }),
  defaults: ({ paths, plugins }) => ({
    default: 'sync',
    connections: {
      sync: { driver: 'sync' },
      redis: {
        driver: 'redis',
        host: '127.0.0.1',
        port: 6379,
        db: 0,
        keyPrefix: 'nocobase:queue:',
        tls: false,
      },
      database: {
        driver: 'database',
        table: 'queue_jobs',
        schedulesTable: 'queue_schedules',
      },
    },
    worker: {
      queues: ['default'],
      concurrency: 1,
      idleDelay: '2s',
    },
    jobs: {
      locations: [
        path.join(paths.server(), 'jobs/**/*.{ts,js}'),
        ...createPluginJobLocations(
          plugins.plugins.map((plugin) => plugin.metadata),
        ),
      ],
      autoLoad: true,
      hotReload: false,
    },
  }),
  envMappings: {
    QUEUE_CONNECTION: envString('default'),
    REDIS_HOST: envString('connections.redis.host'),
    REDIS_PORT: envInteger('connections.redis.port'),
    REDIS_USERNAME: envString('connections.redis.username'),
    REDIS_PASSWORD: envString('connections.redis.password'),
    REDIS_DB: envInteger('connections.redis.db'),
    QUEUE_REDIS_PREFIX: envString('connections.redis.keyPrefix'),
    REDIS_TLS: envBoolean('connections.redis.tls'),
    QUEUE_DB_CONNECTION: envString('connections.database.connection'),
    QUEUE_TABLE: envString('connections.database.table'),
    QUEUE_SCHEDULES_TABLE: envString('connections.database.schedulesTable'),
    QUEUE_WORKER_CONNECTION: envString('worker.connection'),
    QUEUE_WORKER_QUEUES: envStrings('worker.queues'),
    QUEUE_WORKER_CONCURRENCY: envInteger('worker.concurrency'),
    QUEUE_WORKER_IDLE_DELAY: envString('worker.idleDelay'),
    QUEUE_WORKER_TIMEOUT: envString('worker.timeout'),
    QUEUE_JOBS_AUTO_LOAD: envBoolean('jobs.autoLoad'),
    QUEUE_JOBS_HOT_RELOAD: envBoolean('jobs.hotReload'),
  },
});
