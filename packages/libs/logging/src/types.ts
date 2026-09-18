import type { LogOutputOptions, LoggerFileOptions } from './output.js';

import type {
  DestinationStream,
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
} from 'pino';

export type Logger = PinoLogger;

export type LoggerLevel =
  'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggerConfig extends Omit<PinoLoggerOptions, 'redact'> {
  /** Uses the secure NocoBase defaults when omitted and disables them when false. */
  redact?: false | PinoLoggerOptions['redact'];
}

export interface LoggingConfig extends LoggerConfig, LogOutputOptions {
  /** @deprecated getLogger() defaults to system; select other sources explicitly. */
  default?: string;
  /** @deprecated Use console.pretty. */
  pretty?: boolean;
  loggers?: Readonly<
    Record<string, LoggerConfig & { file?: LoggerFileOptions }>
  >;
}

export type { DestinationStream, PinoLoggerOptions };
