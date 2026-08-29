import { type AppSessionConfig } from '@nocobase/session';
import { Type } from '@sinclair/typebox';
import {
  envBoolean,
  envInteger,
  envString,
  envStrings,
} from '../config/index.js';

import { defineAppConfig, type AppConfigDefinition } from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export const sessionConfig: AppConfigDefinition<
  AppSessionConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig<AppSessionConfig>()({
  namespace: 'session',
  schema: Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    default: Type.String(),
    cookie: Type.Object({
      name: Type.String(),
      path: Type.Optional(Type.String()),
      domain: Type.Optional(Type.String()),
      secure: Type.Optional(Type.Boolean()),
      httpOnly: Type.Optional(Type.Boolean()),
      sameSite: Type.Optional(
        Type.Union([
          Type.Literal('lax'),
          Type.Literal('strict'),
          Type.Literal('none'),
        ]),
      ),
      partitioned: Type.Optional(Type.Boolean()),
      expireOnClose: Type.Optional(Type.Boolean()),
    }),
    lifetime: Type.Object({
      absolute: Type.Union([Type.Number(), Type.String()]),
      inactivity: Type.Optional(Type.Union([Type.Number(), Type.String()])),
      rolling: Type.Optional(Type.Boolean()),
    }),
    secret: Type.String(),
    previousSecrets: Type.Optional(Type.Array(Type.String())),
    gcLottery: Type.Optional(
      Type.Tuple([Type.Number({ minimum: 0 }), Type.Number({ minimum: 1 })]),
    ),
    stores: Type.Record(
      Type.String(),
      Type.Object(
        {
          driver: Type.String(),
          base: Type.Optional(Type.String()),
          url: Type.Optional(Type.String()),
          host: Type.Optional(Type.String()),
          port: Type.Optional(Type.Number()),
          username: Type.Optional(Type.String()),
          password: Type.Optional(Type.String()),
          db: Type.Optional(Type.Number()),
          keyPrefix: Type.Optional(Type.String()),
          ttl: Type.Optional(Type.Number()),
          tls: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: true },
      ),
    ),
  }),
  defaults: ({ paths }) => ({
    enabled: true,
    default: 'memory',
    cookie: {
      name: 'nocobase_session',
      path: '/',
      secure: false,
      httpOnly: true,
      sameSite: 'lax' as const,
      partitioned: false,
      expireOnClose: false,
    },
    lifetime: {
      absolute: '2h',
      rolling: true,
    },
    secret: 'nocobase-local-session-secret',
    previousSecrets: [],
    gcLottery: [2, 100],
    stores: {
      memory: {
        driver: 'memory',
        base: 'nocobase:session:',
      },
      fs: {
        driver: 'fs',
        base: paths.storage('sessions'),
      },
      redis: {
        driver: 'redis',
        host: '127.0.0.1',
        port: 6379,
        db: 0,
        base: 'nocobase:session:',
        tls: false,
      },
      null: { driver: 'null' },
    },
  }),
  envMappings: {
    SESSION_ENABLED: envBoolean('enabled'),
    SESSION_STORE: envString('default'),
    SESSION_COOKIE: envString('cookie.name'),
    SESSION_PATH: envString('cookie.path'),
    SESSION_DOMAIN: envString('cookie.domain'),
    SESSION_SECURE_COOKIE: envBoolean('cookie.secure'),
    SESSION_HTTP_ONLY: envBoolean('cookie.httpOnly'),
    SESSION_SAME_SITE: envString('cookie.sameSite'),
    SESSION_PARTITIONED_COOKIE: envBoolean('cookie.partitioned'),
    SESSION_EXPIRE_ON_CLOSE: envBoolean('cookie.expireOnClose'),
    SESSION_LIFETIME: envString('lifetime.absolute'),
    SESSION_INACTIVITY_TIMEOUT: envString('lifetime.inactivity'),
    SESSION_ROLLING: envBoolean('lifetime.rolling'),
    SESSION_SECRET: envString('secret'),
    SESSION_PREVIOUS_SECRETS: envStrings('previousSecrets'),
    SESSION_GC_LOTTERY_HITS: envInteger('gcLottery.0'),
    SESSION_GC_LOTTERY_TOTAL: envInteger('gcLottery.1'),
    SESSION_FILES: envString('stores.fs.base'),
    SESSION_REDIS_URL: envString('stores.redis.url'),
    REDIS_HOST: envString('stores.redis.host'),
    REDIS_PORT: envInteger('stores.redis.port'),
    REDIS_USERNAME: envString('stores.redis.username'),
    REDIS_PASSWORD: envString('stores.redis.password'),
    REDIS_DB: envInteger('stores.redis.db'),
    REDIS_TLS: envBoolean('stores.redis.tls'),
  },
});
