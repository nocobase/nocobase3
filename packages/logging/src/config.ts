import type { LoggingConfig } from './types.js';

/** A minimal production-safe template that writes structured logs to stdout. */
export function createDefaultLoggingConfig(): LoggingConfig {
  return {
    default: 'system',
    loggers: {
      system: {
        level: 'info',
      },
    },
  };
}

/** A fallback for tests and runtimes that intentionally disable logging. */
export function createSilentLoggingConfig(): LoggingConfig {
  return {
    default: 'system',
    loggers: {
      system: {
        enabled: false,
        level: 'silent',
      },
    },
  };
}
