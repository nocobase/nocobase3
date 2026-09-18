import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createLogging, readJournal } from '../src/index.js';

it('keeps app identity and readable request summaries without losing journal context', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pretty-logging-'));
  const stdout = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const logging = createLogging({
    base: {
      service: 'app',
      appId: 'customer',
      runtimeId: 'runtime-1',
      deploymentId: 'release-1',
    },
    file: { directory },
    console: { enabled: true, pretty: true, color: false },
  });
  try {
    const logger = logging.getLogger('request');
    const fields = {
      requestId: 'request-1',
      req: { method: 'GET', path: '/api/items' },
      res: { status: 200 },
      durationMs: 3,
    };
    logger.info(fields, 'GET /api/items 200 completed');
    logger.error(
      { ...fields, res: { status: 500 }, err: new Error('failure') },
      'GET /api/items 500 failed',
    );
    await logging.close();
    const success = String(stdout.mock.calls[0]?.[0]);
    expect(success).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3} INFO \[customer\/request\] GET \/api\/items 200 completed 3ms\n$/,
    );
    const failure = String(stdout.mock.calls[1]?.[0]);
    expect(failure).toContain('ERROR [customer/request]');
    expect(failure).toContain('request-1');
    expect(failure).toContain('failure');
    const journal = await readJournal(directory, { fromStart: true });
    expect(journal.entries[0]).toMatchObject({
      ...fields,
      runtimeId: 'runtime-1',
      deploymentId: 'release-1',
    });
    expect(journal.entries[0]?.time).toMatch(/Z$/);
  } finally {
    await logging.close();
    stdout.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it('leaves JSON console entries structured and supports disabling the console', async () => {
  const stdout = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  try {
    for (const enabled of [true, false]) {
      const logging = createLogging({
        file: { enabled: false },
        console: { enabled, pretty: false },
        base: { appId: 'app3' },
      });
      logging.getLogger('lifecycle').info('Application initialized');
      await logging.close();
    }
    expect(stdout).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      appId: 'app3',
      level: 30,
      logger: 'lifecycle',
    });
  } finally {
    stdout.mockRestore();
  }
});

it('colors level labels only for a terminal, and lets the environment and the config decide', async () => {
  const stdout = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const previous = {
    noColor: process.env.NO_COLOR,
    forceColor: process.env.FORCE_COLOR,
    isTTY: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
  };
  const setTTY = (value: boolean): void => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value,
      configurable: true,
    });
  };
  const emit = async (options: {
    enabled: boolean;
    pretty: boolean;
    color?: boolean;
  }): Promise<string> => {
    stdout.mockClear();
    const logging = createLogging({
      file: { enabled: false },
      console: options,
    });
    const logger = logging.getLogger('system');
    logger.info('Application initialized');
    logger.warn('Cache backend is slow');
    logger.error('Failed to open database');
    await logging.close();
    return stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
  };
  try {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    setTTY(true);
    const terminal = await emit({ enabled: true, pretty: true });
    expect(terminal).toContain(
      '\u001b[32mINFO\u001b[39m [system] Application initialized',
    );
    expect(terminal).toContain('\u001b[33mWARN\u001b[39m [system]');
    expect(terminal).toContain('\u001b[31mERROR\u001b[39m [system]');

    setTTY(false);
    expect(await emit({ enabled: true, pretty: true })).not.toContain(
      '\u001b[',
    );

    process.env.FORCE_COLOR = '1';
    expect(await emit({ enabled: true, pretty: true })).toContain(
      '\u001b[32mINFO\u001b[39m',
    );
    expect(
      await emit({ enabled: true, pretty: true, color: false }),
    ).not.toContain('\u001b[');

    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = '1';
    setTTY(true);
    expect(await emit({ enabled: true, pretty: true })).not.toContain(
      '\u001b[',
    );
    expect(await emit({ enabled: true, pretty: true, color: true })).toContain(
      '\u001b[32mINFO\u001b[39m',
    );

    // Structured console output stays machine-readable whatever the color policy says.
    expect(
      await emit({ enabled: true, pretty: false, color: true }),
    ).not.toContain('\u001b[');
  } finally {
    if (previous.noColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous.noColor;
    if (previous.forceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previous.forceColor;
    if (previous.isTTY)
      Object.defineProperty(process.stdout, 'isTTY', previous.isTTY);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    stdout.mockRestore();
  }
});
