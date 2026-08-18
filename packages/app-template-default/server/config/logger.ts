import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import { resolveLoggerLevel, type AppLoggerConfig } from '@nocobase/logger';

const defaultRedactPaths = [
  'password',
  'password_confirmation',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'headers.Cookie',
];

const loggerConfig: ConfigFactory<AppLoggerConfig> = defineConfig(
  ({ env }): AppLoggerConfig => ({
    default: env.string('LOG_CHANNEL', 'app'),

    channels: {
      app: {
        driver: 'console',
        name: env.string('LOG_NAME', 'app-template-default'),
        level: resolveLoggerLevel(env.string('LOG_LEVEL'), 'info'),
        pretty: env.boolean('LOG_PRETTY', false),
        base: {
          service: env.string('LOG_SERVICE', 'app-template-default'),
        },
        redact: env.list('LOG_REDACT', defaultRedactPaths),
      },

      silent: {
        driver: 'silent',
      },
    },
  }),
);

export default loggerConfig;
