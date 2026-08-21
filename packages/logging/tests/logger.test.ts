import type { DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/index.js';

describe('createLogger', () => {
  it('creates structured loggers and supports child bindings', () => {
    const output = createMemoryDestination();
    const logger = createLogger(
      { level: 'debug', base: { app: 'test' } },
      output,
    );

    logger
      .child({ module: 'authentication' })
      .debug({ requestId: 'req-1' }, 'signed in');

    expect(output.records()).toEqual([
      expect.objectContaining({
        level: 20,
        app: 'test',
        module: 'authentication',
        requestId: 'req-1',
        msg: 'signed in',
      }),
    ]);
  });

  it('redacts common credentials by default', () => {
    const output = createMemoryDestination();
    const logger = createLogger({}, output);

    logger.info({ password: 'secret', token: 'session-token' }, 'credentials');

    expect(output.records()[0]).toMatchObject({
      password: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('allows default redaction to be disabled explicitly', () => {
    const output = createMemoryDestination();
    const logger = createLogger({ redact: false }, output);

    logger.info({ password: 'secret' }, 'credentials');

    expect(output.records()[0]).toMatchObject({ password: 'secret' });
  });

  it('merges custom and default redaction paths', () => {
    const output = createMemoryDestination();
    const logger = createLogger({ redact: ['credentials.secret'] }, output);

    logger.info(
      { password: 'secret', credentials: { secret: 'secret' } },
      'credentials',
    );

    expect(output.records()[0]).toMatchObject({
      password: '[REDACTED]',
      credentials: { secret: '[REDACTED]' },
    });
  });

  it('rejects transport and destination together', () => {
    expect(() =>
      createLogger(
        {
          transport: { target: 'pino-pretty' },
        },
        createMemoryDestination(),
      ),
    ).toThrow('both transport and destination');
  });
});

type MemoryDestination = DestinationStream & {
  records(): Array<Record<string, unknown>>;
};

function createMemoryDestination(): MemoryDestination {
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
