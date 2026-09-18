// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type AppIdentityConfig } from '@nocobase/app-server/config';
import {
  planAppDatabaseTasks,
  resolveAppMetadataStore,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppDatabaseTaskContributions } from '@nocobase/app-server/plugins';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import {
  type CachingConfig,
  type AppDriveConfig,
  type AppLoggingConfig,
  type AppQueueConfig,
  type AppSessionConfigInput,
} from '@nocobase/app-server';
import { describe, expect, it } from 'vitest';

import {
  createNotificationRegistry,
  type NotificationConfig,
} from '@nocobase/app-plugin-notification/server';
import {
  createInAppChannelDefinition,
  createDatabaseProviderDefinition,
  MemoryInAppStore,
} from '@nocobase/app-plugin-notification-in-app/server';

import appRuntime from '../../server/runtime.ts';

const templateRootDir = fileURLToPath(new URL('../..', import.meta.url));

describe('application config', () => {
  it('offers in-app test sending by default and honors an explicit disabled configuration', async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'examples-notification-config-'),
    );
    const configPath = path.join(directory, 'config.yml');
    try {
      writeFileSync(configPath, '{}');
      const resolve = () =>
        resolveStandaloneAppRuntime(appRuntime, {
          rootDir: templateRootDir,
          configPath,
          env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
        });
      const runtime = await resolve();
      const definition = createInAppChannelDefinition();
      const registry = createNotificationRegistry()
        .registerChannel(definition)
        .registerProvider(
          'in-app',
          createDatabaseProviderDefinition({
            store: new MemoryInAppStore(),
            recipientExists: async () => true,
          }),
        );
      const config = runtime.config.get<NotificationConfig>('notification')!;
      expect(registry.testTargets(config)).toEqual([
        expect.objectContaining({
          channel: expect.objectContaining({ type: 'in-app' }),
          provider: expect.objectContaining({
            name: 'default',
            type: 'database',
          }),
        }),
      ]);
      const channelConfig = config.channels[0]!;
      for (const recipient of ['', 'another-user']) {
        expect(
          definition.test?.toSendInput({
            actor: { userId: 'current-user' },
            values: { recipient, title: 'Test', body: 'Hello' },
            channelConfig,
            providerConfig: channelConfig.providers[0]!,
          }),
        ).toMatchObject({
          to: { type: 'user', id: recipient || 'current-user' },
        });
      }
      writeFileSync(configPath, 'notification:\n  channels: []\n');
      const disabled = await resolve();
      expect(
        registry.testTargets(
          disabled.config.get<NotificationConfig>('notification')!,
        ),
      ).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

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
      const database = runtime.config.get<AppDatabaseConfig>('database')!;
      expect(database.default).toBe('main');
      expect(database.connections.analytics).toMatchObject({
        dialect: 'sqlite',
        filename: path.join(templateRootDir, 'storage/analytics.sqlite'),
        schemaManagement: 'managed',
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      });
      expect(database.connections.externalCrm).toMatchObject({
        dialect: 'sqlite',
        filename: path.join(templateRootDir, 'storage/external-crm.sqlite'),
        schemaManagement: 'external',
        naming: { underscored: true, tablePrefix: 'crm_' },
      });
      // No store is configured: an external connection reads
      // database/externalCrm/collections/*/metadata.json by default.
      expect(database.connections.externalCrm.metadataStore).toBeUndefined();
      expect(
        resolveAppMetadataStore(undefined, {
          name: 'externalCrm',
          external: true,
          paths: runtime.configPaths,
        }),
      ).toEqual({
        type: 'directory',
        directory: path.join(
          templateRootDir,
          'database/externalCrm/collections',
        ),
      });
      const analytics = planAppDatabaseTasks(
        database,
        ['migrations', 'seeds'],
        {
          paths: runtime.configPaths,
          contributions: createAppDatabaseTaskContributions(runtime.plugins),
          autoRun: true,
        },
      ).filter((task) => task.connection === 'analytics');
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
      await runtime.config.reload();
      expect(
        runtime.config.get<AppDatabaseConfig>('database')!.connections
          .analytics,
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
  it('assembles module defaults in the runtime', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    expect(runtime.config.get<AppIdentityConfig>('app')!.name).toBe('main');
    expect(runtime.config.get<CachingConfig>('caching')!.default).toBe(
      'memory',
    );
    expect(runtime.config.get<AppDatabaseConfig>('database')!.default).toBe(
      'main',
    );
    const drive = runtime.config.get<AppDriveConfig>('drive')!;
    expect(drive.default).toBe('local');
    expect(drive.disks.local).toEqual({
      driver: 'fs',
      location: fileURLToPath(new URL('../../storage', import.meta.url)),
      visibility: 'private',
    });
    expect(drive.disks.public).toBeUndefined();
    expect(runtime.config.get<AppLoggingConfig>('logging')!.default).toBe(
      'system',
    );
    expect(runtime.config.get<AppQueueConfig>('queue')!.default).toBe('sync');
    expect(runtime.config.get<AppQueueConfig>('queue')!.queues).toEqual({
      schedule: { connection: 'database' },
    });
    expect(
      runtime.config.get<AppQueueConfig>('queue')!.jobs?.locations,
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /app-template-examples\/server\/jobs\/\*\*\/\*\.\{ts,js\}$/,
        ),
      ]),
    );
    expect(runtime.config.get<AppSessionConfigInput>('session')!.default).toBe(
      'memory',
    );
  });

  it('reloads a file-backed configuration explicitly', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: { AUTH_SECRET: 'test-auth-secret-at-least-32-characters' },
    });

    const result = await runtime.config.reload();

    expect(result.changedNamespaces).toEqual([]);
  });
  it('loads only explicit env overrides and restores defaults on reload', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: templateRootDir,
      env: {
        APP_SERVER_PORT: '14001',
        REDIS_HOST: 'ignored',
        NODE_ENV: 'production',
      },
    });
    expect(runtime.config.get('server.port')).toBe(14001);
    expect(runtime.config.get('queue.connections.redis.host')).toBe(
      '127.0.0.1',
    );
    expect(runtime.config.get('session.stores.redis.host')).toBe('127.0.0.1');
    expect(runtime.config.get('logging.pretty')).toBe(false);
    expect(runtime.config.get('session.cookie.secure')).toBe(true);
    expect(runtime.config.get('workflow.production')).toBe(true);
    delete runtime.env.APP_SERVER_PORT;
    await runtime.config.reload();
    expect(runtime.config.get('server.port')).toBe(13000);
  });
});
