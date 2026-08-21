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
      level: 'info',
      loggers: {
        audit: { level: 'warn' },
      },
    });

    expect(logging.getLogger('audit').level).toBe('warn');
    expect(logging.getLogger('audit').bindings()).toMatchObject({
      logger: 'audit',
    });
  });

  it('uses the top-level config for unconfigured logger names', () => {
    const logging = createLogging({ default: 'system', level: 'debug' });
    const request = logging.getLogger('request');

    expect(request.level).toBe('debug');
    expect(request.bindings()).toMatchObject({ logger: 'request' });
  });

  it('merges named logger bindings with the top-level defaults', () => {
    const logging = createLogging({
      base: { service: 'nocobase', environment: 'test' },
      loggers: {
        audit: { base: { module: 'audit' } },
      },
    });

    expect(logging.getLogger('audit').bindings()).toMatchObject({
      service: 'nocobase',
      environment: 'test',
      module: 'audit',
      logger: 'audit',
    });
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
