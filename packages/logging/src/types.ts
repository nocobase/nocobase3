import type { Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export type LogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'silent';

export type LogOutput = 'console' | 'file';
export type ConsoleFormat = 'pretty' | 'json';

export interface ConsoleOutputOptions {
  format?: ConsoleFormat;
  colorize?: boolean;
  singleLine?: boolean;
  translateTime?: string | boolean;
}

export interface FileOutputOptions {
  path: string;
  mkdir?: boolean;
  sync?: boolean;
}

export interface RedactOptions {
  paths: string[];
  censor?: string;
  remove?: boolean;
}

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  base?: Record<string, unknown> | null;
  outputs?: LogOutput[];
  console?: ConsoleOutputOptions;
  file?: FileOutputOptions;
  redact?: false | string[] | RedactOptions;
}
