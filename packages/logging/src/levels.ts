import type { LoggerLevel } from './types.js';

export const loggerLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export function isLoggerLevel(value: unknown): value is LoggerLevel {
  return typeof value === 'string' && (loggerLevels as readonly string[]).includes(value);
}
