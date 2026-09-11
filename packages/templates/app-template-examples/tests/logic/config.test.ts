// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { appConfig } from '@nocobase/app-server/config';
import {
  databaseConfig,
  planAppDatabaseTasks,
} from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import {
  cachingConfig,
  driveConfig,
  loggingConfig,
  queueConfig,
  sessionConfig,
} from '@nocobase/app-server';
import { describe, expect, it } from 'vitest';

import appRuntime from '../../server/runtime.ts';

const templateRootDir = fileURLToPath(new URL('../..', import.meta.url));

describe('application config', () => {
  it('supplies analytics for main-only configs and honors file overrides', async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'examples-analytics-config-'),
    );
    const configPath = path.join(directory, 'config.yml');
    try {
      writeFileSync(
        configPath,
        'database:\n  default: main\n  connections:\n    main:\n      dialect: sqlite\n      database: main.sqlite\n',
      );
      const runtime = await resolveStandaloneAppRuntime(appRuntime, {
        rootDir: templateRootDir,
        configPath,
        env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
      });
      const database = runtime.appConfig.get(databaseConfig);
      expect(database.default).toBe('main');
      expect(database.connections.analytics).toMatchObject({
        dialect: 'sqlite',
        database: 'analytics.sqlite',
        schemaManagement: 'managed',
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      });
      const plan = planAppDatabaseTasks(
        database,
        runtime.configPaths,
        ['migrations', 'seeds'],
        { autoRun: true },
      );
      const analytics = plan.filter((task) => task.connection === 'analytics');
      expect(analytics.map((task) => task.skipReason)).toEqual([
        undefined,
        undefined,
      ]);
      expect(
        analytics.map((task) =>
          task.config.sources?.map((source) => source.directory),
        ),
      ).toEqual([
        [path.join(templateRootDir, 'database/analytics/migrations')],
        [path.join(templateRootDir, 'database/analytics/seeds')],
      ]);
      writeFileSync(
        configPath,
        'database:\n  connections:\n    analytics:\n      database: custom-analytics.sqlite\n      migrations:\n        autoRun: false\n      seeds:\n        autoRun: false\n',
      );
      await runtime.appConfig.reload();
      expect(
        runtime.appConfig.get(databaseConfig).connections.analytics,
      ).toMatchObject({
        dialect: 'sqlite',
        database: 'custom-analytics.sqlite',
        migrations: { autoRun: false },
        seeds: { autoRun: false },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('loads module definitions through the runtime registry', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    expect(runtime.appConfig.get(appConfig).name).toBe('main');
    expect(runtime.appConfig.get(cachingConfig).default).toBe('memory');
    expect(runtime.appConfig.get(databaseConfig).default).toBe('main');
    const drive = runtime.appConfig.get(driveConfig);
    expect(drive.default).toBe('local');
    expect(drive.disks.local).toEqual({
      driver: 'fs',
      location: fileURLToPath(new URL('../../storage', import.meta.url)),
      visibility: 'private',
    });
    expect(drive.disks.public).toBeUndefined();
    expect(runtime.appConfig.get(loggingConfig).default).toBe('system');
    expect(runtime.appConfig.get(queueConfig).default).toBe('sync');
    expect(runtime.appConfig.get(sessionConfig).default).toBe('memory');
  });

  it('reloads a file-backed configuration explicitly', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    const result = await runtime.appConfig.reload();

    expect(result.changedNamespaces).toEqual([]);
  });
});
