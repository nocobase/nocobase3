import { describe, expect, it } from 'vitest';

import {
  assertDefaultChannel,
  createLoggerManager,
  createSilentLoggerConfig,
  resolveLoggerLevel,
  type AppLoggerConfig,
  type DestinationStream,
} from '../src/index.js';

describe('createLoggerManager', () => {
  it('creates pino loggers from declarative config', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createConfig(), {
      destination: output,
    });

    loggerManager.use().info({ hello: 'world' }, 'hello');

    expect(output.records()).toEqual([
      expect.objectContaining({
        channel: 'app',
        hello: 'world',
        level: 30,
        msg: 'hello',
        name: 'test-app',
        service: 'test-service',
      }),
    ]);
  });

  it('uses a configured named channel', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createConfig(), {
      destination: output,
    });

    loggerManager.use('api').debug('debug from api');

    expect(output.records()).toEqual([
      expect.objectContaining({
        channel: 'api',
        level: 20,
        msg: 'debug from api',
      }),
    ]);
  });

  it('redacts configured fields', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createConfig(), {
      destination: output,
    });

    loggerManager.use().info({ password: 'secret' }, 'redacted');

    expect(output.records()[0]).toMatchObject({
      password: '[Redacted]',
    });
  });

  it('respects logger levels', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createConfig(), {
      destination: output,
    });

    loggerManager.use().debug('hidden');
    loggerManager.use().info('visible');

    expect(output.records().map((record) => record.msg)).toEqual(['visible']);
  });

  it('keeps the pino child logger API available', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createConfig(), {
      destination: output,
    });

    loggerManager.use().child({ module: 'users' }).warn('child');

    expect(output.records()[0]).toMatchObject({
      channel: 'app',
      module: 'users',
      msg: 'child',
    });
  });

  it('throws when the default channel is missing', () => {
    expect(() =>
      createLoggerManager({
        default: 'missing',
        channels: {},
      }),
    ).toThrow('Default logger channel "missing" is not configured.');
  });

  it('throws when a requested channel is missing', () => {
    const loggerManager = createLoggerManager(createConfig());

    expect(() => loggerManager.use('missing')).toThrow('Logger channel "missing" is not configured.');
  });

  it('creates a silent logger config fallback', () => {
    const output = createMemoryDestination();
    const loggerManager = createLoggerManager(createSilentLoggerConfig(), {
      destination: output,
    });

    loggerManager.use().fatal('hidden');

    expect(output.records()).toEqual([]);
  });
});

describe('assertDefaultChannel', () => {
  it('accepts a configured default channel', () => {
    expect(() => assertDefaultChannel(createConfig())).not.toThrow();
  });
});

describe('resolveLoggerLevel', () => {
  it('accepts known logger levels', () => {
    expect(resolveLoggerLevel('debug', 'info')).toBe('debug');
  });

  it('falls back for unknown logger levels', () => {
    expect(resolveLoggerLevel('verbose', 'info')).toBe('info');
  });
});

function createConfig(): AppLoggerConfig {
  return {
    default: 'app',
    channels: {
      app: {
        driver: 'console',
        name: 'test-app',
        level: 'info',
        base: {
          service: 'test-service',
        },
        redact: ['password'],
      },
      api: {
        driver: 'console',
        level: 'debug',
      },
      silent: {
        driver: 'silent',
      },
    },
  };
}

function createMemoryDestination(): DestinationStream & {
  records(): Array<Record<string, unknown>>;
} {
  const lines: string[] = [];

  return {
    write(message: string): void {
      lines.push(message);
    },
    records(): Array<Record<string, unknown>> {
      return lines
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}
