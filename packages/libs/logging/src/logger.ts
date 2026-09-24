import { sanitizeLog } from './journal.js';
import pino, { stdTimeFunctions, type DestinationStream } from 'pino';

import type { Logger, LoggerConfig } from './types.js';

export const defaultRedactPaths: readonly string[] = [
  'password',
  '*.password',
  'password_confirmation',
  '*.password_confirmation',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'headers.Cookie',
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.headers.cookie',
  'req.headers.Cookie',
];

function resolveRedact(
  redact: LoggerConfig['redact'],
): Exclude<LoggerConfig['redact'], false | undefined> | undefined {
  if (redact === false) {
    return undefined;
  }
  if (!redact) {
    return { paths: [...defaultRedactPaths], censor: '[REDACTED]' };
  }
  if (Array.isArray(redact)) {
    return {
      paths: [...new Set([...defaultRedactPaths, ...redact])],
      censor: '[REDACTED]',
    };
  }
  return {
    ...redact,
    paths: [...new Set([...defaultRedactPaths, ...redact.paths])],
    censor: redact.censor ?? '[REDACTED]',
  };
}

export function createLogger(
  config: LoggerConfig = {},
  destination?: DestinationStream,
): Logger {
  if (config.transport && destination) {
    throw new Error('A logger cannot use both transport and destination.');
  }

  const { redact: configuredRedact, ...options } = config;
  const redact = resolveRedact(configuredRedact);
  const loggerOptions: pino.LoggerOptions = {
    ...options,
    serializers: {
      err: (error: unknown) => sanitizeLog(error),
      ...options.serializers,
    },
    timestamp: options.timestamp ?? stdTimeFunctions.isoTime,
    ...(redact ? { redact } : {}),
  };

  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

/** Message-first bridge for runtime infrastructure that also runs before App logging exists. */
export function createDiagnosticLogger(
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>,
): {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
} {
  const write = (
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: unknown,
  ): void => {
    const fields =
      details instanceof Error
        ? { err: details }
        : details && typeof details === 'object'
          ? (details as Record<string, unknown>)
          : { details };
    if (logger)
      logger[level](sanitizeLog(fields) as Record<string, unknown>, message);
    else
      process.stderr.write(
        `${level.toUpperCase()} ${message}${details === undefined ? '' : ` ${JSON.stringify(sanitizeLog(fields))}`}\n`,
      );
  };
  return {
    info: (message, details) => write('info', message, details),
    warn: (message, details) => write('warn', message, details),
    error: (message, details) => write('error', message, details),
  };
}
