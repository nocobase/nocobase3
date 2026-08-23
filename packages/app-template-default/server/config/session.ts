import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { AppSessionConfig, SessionSameSite } from '@nocobase/session';

const sessionConfig: ConfigFactory<AppSessionConfig> = defineConfig(
  ({ env, paths }): AppSessionConfig => ({
    enabled: env.boolean('SESSION_ENABLED', true),
    default: env.string(
      'SESSION_STORE',
      env.string('SESSION_DRIVER', 'memory'),
    ),

    cookie: {
      name: env.string('SESSION_COOKIE', 'nocobase_session'),
      path: env.string('SESSION_PATH', '/'),
      domain: env.string('SESSION_DOMAIN'),
      secure: env.boolean(
        'SESSION_SECURE_COOKIE',
        env.string('NODE_ENV') === 'production',
      ),
      httpOnly: env.boolean('SESSION_HTTP_ONLY', true),
      sameSite: resolveSameSite(env.string('SESSION_SAME_SITE'), 'lax'),
      partitioned: env.boolean('SESSION_PARTITIONED_COOKIE', false),
      expireOnClose: env.boolean('SESSION_EXPIRE_ON_CLOSE', false),
    },

    lifetime: {
      absolute: env.string('SESSION_LIFETIME', '2h'),
      inactivity: env.string('SESSION_INACTIVITY_TIMEOUT'),
      rolling: env.boolean('SESSION_ROLLING', true),
    },

    secret: env.string(
      'SESSION_SECRET',
      env.string('AUTH_SECRET', 'nocobase-local-session-secret'),
    ),
    previousSecrets: env.list('SESSION_PREVIOUS_SECRETS', []),
    gcLottery: [
      env.number('SESSION_GC_LOTTERY_HITS', 2),
      env.number('SESSION_GC_LOTTERY_TOTAL', 100),
    ],

    stores: {
      memory: {
        driver: 'memory',
        base: env.string('SESSION_PREFIX', 'nocobase:session:'),
      },

      fs: {
        driver: 'fs',
        base: env.string('SESSION_FILES', paths.storage('sessions')),
      },

      redis: {
        driver: 'redis',
        url: env.string('SESSION_REDIS_URL'),
        host: env.string('REDIS_HOST', '127.0.0.1'),
        port: env.number('REDIS_PORT', 6379),
        username: env.string('REDIS_USERNAME'),
        password: env.string('REDIS_PASSWORD'),
        db: env.number('REDIS_DB', 0),
        keyPrefix: env.string('SESSION_REDIS_KEY_PREFIX'),
        base: env.string('SESSION_REDIS_PREFIX', 'nocobase:session:'),
        ttl: env.number('SESSION_REDIS_TTL'),
        tls: env.boolean('REDIS_TLS', false),
      },

      null: {
        driver: 'null',
      },
    },
  }),
);

export default sessionConfig;

function resolveSameSite(
  value: string | undefined,
  fallback: SessionSameSite,
): SessionSameSite {
  const normalized = value?.toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }

  return fallback;
}
