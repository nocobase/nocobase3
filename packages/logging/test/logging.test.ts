import { describe, expect, it } from 'vitest';

import {
  createLogging,
  createSilentLoggingConfig,
  isLoggerLevel,
} from '../src/index.js';

describe('Logging', () => {
  it('lazily creates and caches the default logger', () => {
    const logging = createLogging();

    expect(logging.getLogger()).toBe(logging.getLogger('system'));
  });

  it('supports configured named loggers', () => {
    const logging = createLogging({
      default: 'system',
      loggers: {
        system: { level: 'info' },
        audit: { level: 'warn' },
      },
    });

    expect(logging.hasLogger('audit')).toBe(true);
    expect(logging.getLogger('audit').level).toBe('warn');
  });

  it('rejects missing default and requested loggers', () => {
    expect(() => createLogging({ default: 'missing', loggers: {} }))
      .toThrow('Default logger "missing" is not configured.');

    const logging = createLogging({ default: 'system', loggers: { system: {} } });
    expect(() => logging.getLogger('missing')).toThrow('Logger "missing" is not configured.');
  });

  it('provides a silent fallback and flushes instantiated loggers', async () => {
    const logging = createLogging(createSilentLoggingConfig());

    logging.getLogger().fatal('hidden');

    await expect(logging.flush()).resolves.toBeUndefined();
  });
});

describe('isLoggerLevel', () => {
  it('recognizes supported logger levels', () => {
    expect(isLoggerLevel('debug')).toBe(true);
    expect(isLoggerLevel('verbose')).toBe(false);
  });
});
