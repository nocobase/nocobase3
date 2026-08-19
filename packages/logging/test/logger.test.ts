import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('createLogger', () => {
  it('writes structured JSON to a file and supports child bindings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nocobase-logger-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'app.log');
    const logger = createLogger({
      level: 'debug',
      outputs: ['file'],
      file: { path, sync: true },
      base: { app: 'test' },
    });

    logger.child({ plugin: 'authentication' }).debug({ requestId: 'req-1' }, 'signed in');
    logger.flush();

    const entry = JSON.parse((await readFile(path, 'utf8')).trim());
    expect(entry).toMatchObject({
      level: 20,
      app: 'test',
      plugin: 'authentication',
      requestId: 'req-1',
      msg: 'signed in',
    });
  });

  it('redacts common credentials by default', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nocobase-logger-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'app.log');
    const logger = createLogger({
      outputs: ['file'],
      file: { path, sync: true },
    });

    logger.info({ password: 'secret', token: 'session-token' }, 'credentials');
    logger.flush();

    const entry = JSON.parse((await readFile(path, 'utf8')).trim());
    expect(entry).toMatchObject({
      password: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('requires file configuration when file output is enabled', () => {
    expect(() => createLogger({ outputs: ['file'] })).toThrow('logger.file.path is required');
  });
});
