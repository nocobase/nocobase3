import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
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
  'req.headers.referer',
  'req.query.access',
];

const requiredFilesRedactPaths = ['req.headers.referer', 'req.query.access'];

const loggingConfig: ConfigFactory<LoggingConfig> = defineConfig(
  ({ env }): LoggingConfig => {
    const isProduction = env.string('NODE_ENV') === 'production';
    const transport: LoggerConfig['transport'] = env.boolean(
      'LOG_PRETTY',
      !isProduction,
    )
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
      redact: [
        ...new Set([
          ...env.list('LOG_REDACT', defaultRedactPaths),
          ...requiredFilesRedactPaths,
        ]),
      ],
      transport,
    };
  },
);

function resolveLevel(
  value: string | undefined,
  fallback: LoggerLevel,
): LoggerLevel {
  return isLoggerLevel(value) ? value : fallback;
}

export default loggingConfig;
