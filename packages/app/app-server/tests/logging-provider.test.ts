import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { readJournal } from '@nocobase/logging';
import { Application } from '../src/application/index.js';
import { AppConfig, createConfigPaths } from '../src/config/index.js';
import {
  LoggingProvider,
  loggingToken,
  normalizeRuntimeLogging,
} from '../src/logging/index.js';

it('honors the Host logging policy and writes identities to the persistent App volume', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-log-policy-'));
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    app: { name: 'customer' },
    logging: {
      level: 'trace',
      pretty: true,
      file: { enabled: false },
      loggers: { system: { level: 'trace' } },
    },
  });
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: root }),
    runtimeLogging: {
      enabled: true,
      level: 'warn',
      console: false,
      bindings: { deploymentId: 'deployment-1', runtimeId: 'runtime-1' },
    },
  });
  app.addServiceProvider(LoggingProvider);
  try {
    await app.start();
    const logger = app.container.resolve(loggingToken).getLogger('system');
    logger.info('filtered');
    logger.error({ password: 'hidden-value' }, 'visible');
    await app.shutdown();
    const page = await readJournal(path.join(root, 'storage', 'logs'), {
      fromStart: true,
    });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      msg: 'visible',
      appId: 'customer',
      deploymentId: 'deployment-1',
      runtimeId: 'runtime-1',
      password: '[REDACTED]',
    });
  } finally {
    await app.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

it('normalizes legacy runtime policy over merged defaults without losing console controls', () => {
  expect(
    normalizeRuntimeLogging({
      enabled: false,
      maxSizeMB: 20,
      file: { enabled: true, maxTotalSizeMB: 500 },
      console: false,
    }),
  ).toMatchObject({
    file: { enabled: false, maxTotalSizeMB: 20 },
    console: { enabled: false },
  });
});

it.each([
  { enabled: true, pretty: true },
  { enabled: true, pretty: false },
  { enabled: false, pretty: true },
])(
  'applies the structured Host console policy %j over application defaults',
  async (consolePolicy) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'host-console-policy-'));
    const config = new AppConfig();
    await config.loadAll();
    config.mergeDefaults({
      app: { name: 'main' },
      logging: {
        level: 'info',
        console: { enabled: true, pretty: !consolePolicy.pretty },
        file: { enabled: false },
      },
    });
    const app = new Application({
      config,
      paths: createConfigPaths({ rootDir: root }),
      runtimeLogging: {
        file: { enabled: false },
        console: consolePolicy,
        bindings: { appId: 'app3', runtimeId: 'runtime-1' },
      },
    });
    app.addServiceProvider(LoggingProvider);
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      await app.start();
      app.container
        .resolve(loggingToken)
        .getLogger('ai-employee')
        .info({ count: 4 }, 'Resources loaded');
      await app.shutdown();
      expect(output).toHaveBeenCalledTimes(consolePolicy.enabled ? 1 : 0);
      if (consolePolicy.enabled) {
        const line = String(output.mock.calls[0]?.[0]);
        if (consolePolicy.pretty)
          expect(line).toContain(
            'INFO [app3/ai-employee] Resources loaded count=4',
          );
        else
          expect(JSON.parse(line)).toMatchObject({
            appId: 'app3',
            runtimeId: 'runtime-1',
            count: 4,
            level: 30,
          });
      }
    } finally {
      output.mockRestore();
      await app.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each([true, false])(
  'enforces hosted file capture=%s despite App and source overrides',
  async (enabled) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hosted-log-boundary-'));
    const outside = path.join(root, 'outside');
    const config = new AppConfig();
    await config.loadAll();
    config.mergeDefaults({
      app: { name: 'customer' },
      logging: {
        enabled: false,
        level: 'silent',
        transport: { target: 'does-not-exist' },
        file: { enabled: !enabled, directory: outside },
        console: { enabled: false },
        loggers: {
          workflow: {
            enabled: false,
            level: 'silent',
            transport: { target: 'does-not-exist' },
            file: {
              enabled: !enabled,
              name: 'tasks',
              directory: outside,
              maxSizeMB: 0.001,
              maxFileSizeMB: 0.001,
            },
          },
        },
      },
    });
    const app = new Application({
      config,
      paths: createConfigPaths({ rootDir: root }),
      runtimeLogging: {
        level: 'info',
        file: { enabled, maxFileSizeMB: 1, maxTotalSizeMB: 10 },
        console: { enabled: true },
        bindings: { deploymentId: 'deployment-1', runtimeId: 'runtime-1' },
      },
    });
    app.addServiceProvider(LoggingProvider);
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      await app.start();
      const logging = app.container.resolve(loggingToken);
      logging.getLogger().info('System record');
      const logger = logging.getLogger('workflow');
      for (let index = 0; index < 20; index++)
        logger.info({ index }, 'x'.repeat(300));
      await app.shutdown();
      const directory = path.join(root, 'storage', 'logs');
      const page = await readJournal(directory, { fromStart: true });
      expect(page.entries).toHaveLength(enabled ? 21 : 0);
      expect(output).toHaveBeenCalledTimes(21);
      expect(await readdir(outside).catch(() => [])).toEqual([]);
      if (enabled) {
        expect(await readdir(directory)).toHaveLength(2);
        expect(
          page.entries.find((entry) => entry.logger === 'workflow'),
        ).toMatchObject({
          appId: 'customer',
          deploymentId: 'deployment-1',
          runtimeId: 'runtime-1',
        });
      }
    } finally {
      output.mockRestore();
      await app.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  },
);
