import type { LoggerLevel } from './types.js';

export const loggerLevels: readonly LoggerLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];

export function isLoggerLevel(value: unknown): value is LoggerLevel {
  return (
    typeof value === 'string' && loggerLevels.some((level) => level === value)
  );
}
