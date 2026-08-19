import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import {
  isLoggerLevel,
  type LoggerConfig,
  type LoggerLevel,
  type LoggingConfig,
} from '@nocobase/logging';

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

const loggingConfig: ConfigFactory<LoggingConfig> = defineConfig(
  ({ env }): LoggingConfig => {
    const transport: LoggerConfig['transport'] = env.boolean('LOG_PRETTY', false)
      ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
      : undefined;

    return {
      default: env.string('LOG_DEFAULT', 'system'),
      name: env.string('LOG_NAME', 'app-template-default'),
      level: resolveLevel(env.string('LOG_LEVEL'), 'info'),
      base: {
        service: env.string('LOG_SERVICE', 'app-template-default'),
      },
      redact: env.list('LOG_REDACT', defaultRedactPaths),
      transport,
    };
  },
);

function resolveLevel(value: string | undefined, fallback: LoggerLevel): LoggerLevel {
  return isLoggerLevel(value) ? value : fallback;
}

export default loggingConfig;
