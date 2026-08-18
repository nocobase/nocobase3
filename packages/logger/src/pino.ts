import { createRequire } from 'node:module';

import type { DestinationStream } from 'pino';

import type { AppLoggerChannelConfig, ConsoleLoggerChannelConfig, NocoBaseLogger } from './types.js';

const require = createRequire(import.meta.url);
const pino = require('pino') as typeof import('pino');

export function createLogger(
  config: AppLoggerChannelConfig,
  options: {
    channel: string;
    destination?: DestinationStream;
  },
): NocoBaseLogger {
  if (config.driver === 'silent') {
    return createSilentLogger();
  }

  return createConsoleLogger(config, options);
}

export function createConsoleLogger(
  config: ConsoleLoggerChannelConfig,
  options: {
    channel?: string;
    destination?: DestinationStream;
  } = {},
): NocoBaseLogger {
  const loggerOptions = {
    name: config.name,
    level: config.level,
    base: config.base,
    redact: config.redact,
    transport:
      config.pretty && !options.destination
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  };
  const logger = options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions);

  return options.channel ? logger.child({ channel: options.channel }) : logger;
}

export function createSilentLogger(): NocoBaseLogger {
  return pino({
    enabled: false,
    level: 'silent',
  });
}
