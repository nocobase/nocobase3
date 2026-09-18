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
    console: { enabled: true, pretty: true },
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
