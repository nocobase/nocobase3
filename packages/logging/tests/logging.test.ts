import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

  it('resolves logger names in rolling file transports', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-logging-'));
    const logging = createLogging({
      transport: {
        target: 'pino-roll',
        options: {
          file: path.join(directory, '{logger}.log'),
          frequency: 'daily',
          dateFormat: 'yyyy_MM_dd',
        },
      },
    });

    try {
      logging.getLogger('request').info('request received');
      await logging.flush();

      expect(readdirSync(directory)).toEqual([
        expect.stringMatching(/^request\.\d{4}_\d{2}_\d{2}\.1\.log$/),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
