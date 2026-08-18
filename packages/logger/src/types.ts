import type { DestinationStream, Logger, LoggerOptions } from 'pino';

export type LoggerLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface ConsoleLoggerChannelConfig {
  driver: 'console';
  level: LoggerLevel;
  name?: string;
  base?: Record<string, unknown> | null;
  redact?: string[];
  pretty?: boolean;
}

export interface SilentLoggerChannelConfig {
  driver: 'silent';
}

export type AppLoggerChannelConfig = ConsoleLoggerChannelConfig | SilentLoggerChannelConfig;

export interface AppLoggerConfig {
  default: string;
  channels: Record<string, AppLoggerChannelConfig>;
}

export type NocoBaseLogger = Logger;

export interface NocoBaseLoggerManager {
  use(name?: string): NocoBaseLogger;
  flushAll(): Promise<void>;
}

export interface CreateLoggerManagerOptions {
  destination?: DestinationStream;
}

export type { DestinationStream, LoggerOptions };
