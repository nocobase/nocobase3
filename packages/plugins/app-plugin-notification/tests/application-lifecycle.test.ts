// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { Application } from '@nocobase/app-server/application';
import { AppConfig, createAppPaths } from '@nocobase/app-server/config';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  JobExecutorServiceProvider,
  jobExecutorServiceToken,
} from '@nocobase/app-server/jobs';
import {
  authorizationToken,
  createAppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createLogging } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import { expect, it, vi } from 'vitest';

import { NotificationProvider } from '../server/providers/notification.js';
import { NotificationReconcileJob } from '../server/notification-reconcile-job.js';
import { notificationRuntimeToken } from '../server/runtime.js';
import { DatabaseNotificationStore } from '../server/store.js';
import {
  notificationExtensionRegistryToken,
  notificationServiceToken,
} from '../server/tokens.js';

it('boots without notification tables, migrates before start, and drains a running Delivery before Application dependencies close', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'notification-application-lifecycle-'),
  );
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  const client = await connection.client<{
    schema: { hasTable(name: string): Promise<boolean> };
  }>();
  const tables = [
    'notification_dispatches',
    'notification_deliveries',
    'notification_delivery_attempts',
    'notification_delivery_retry_audits',
  ];
  const tablePresence = () =>
    Promise.all(tables.map((table) => client.schema.hasTable(table)));
  const databaseAccess = vi.spyOn(database, 'connection');
  const reconcileStart = vi.spyOn(NotificationReconcileJob.prototype, 'start');
  const events: string[] = [];
  const bootEntered = Promise.withResolvers<void>();
  const migrate = Promise.withResolvers<void>();
  const sendEntered = Promise.withResolvers<void>();
  const releaseSend = Promise.withResolvers<void>();
  const closingEntered = Promise.withResolvers<void>();
  const providerClose = vi.fn(async () => {
    events.push('provider.close');
  });
  let notificationId: string | undefined;
  let terminalDetails: unknown;
  let dependenciesClosed = false;

  class Dependencies extends ServiceProvider<Application> {
    readonly name = 'test/notification-dependencies';
    override register(): void {
      this.app.container.instance(databaseManagerToken, database);
      this.app.container.instance(
        loggingToken,
        createLogging({ level: 'silent' }),
      );
      this.app.container.instance(
        authorizationToken,
        createAppAuthorization({ connection }),
      );
    }
    override async shutdown(): Promise<void> {
      if (notificationId) {
        terminalDetails = await this.app.container
          .resolve(notificationRuntimeToken)
          .logs.get(notificationId);
      }
      events.push('database.close');
      await database.destroy();
      dependenciesClosed = true;
    }
  }

  // Like the channel plugins, definitions arrive during boot after the core provider.
  class ChannelExtension extends ServiceProvider<Application> {
    readonly name = 'test/notification-channel';
    override async boot(): Promise<void> {
      this.app.container
        .resolve(notificationExtensionRegistryToken)
        .registerChannel({
          type: 'email',
          async createChannel() {
            events.push('channel.create');
            return {
              type: 'email',
              validateMessage(message: object) {
                return {
                  message,
                  recipients: [{ address: 'lifecycle@example.com' }],
                };
              },
              async prepare({ message }): Promise<object> {
                return message;
              },
            };
          },
        })
        .registerProvider({
          type: 'barrier',
          messageType: 'email',
          async createProvider() {
            events.push('provider.create');
            return {
              type: 'barrier',
              async send() {
                events.push('send.enter');
                sendEntered.resolve();
                await releaseSend.promise;
                // The real database remains usable while Application shutdown is waiting.
                const log = await new DatabaseNotificationStore(
                  database,
                ).getLogByIdempotencyKey('application-lifecycle');
                events.push(
                  log && !dependenciesClosed
                    ? 'send.database-open'
                    : 'send.database-closed',
                );
                events.push('send.return');
                return {
                  status: 'accepted',
                  providerMessageId: 'barrier-accepted',
                } as const;
              },
              close: providerClose,
            };
          },
        });
    }
  }

  class InstallationBoundary extends ServiceProvider<Application> {
    readonly name = 'test/notification-installation-boundary';
    override async boot(): Promise<void> {
      bootEntered.resolve();
      await migrate.promise;
      await database
        .createMigrator({
          directory: fileURLToPath(
            new URL('../database/migrations', import.meta.url),
          ),
          packageName: '@nocobase/app-plugin-notification',
        })
        .latest();
      events.push('migrations.complete');
    }
  }

  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    app: { name: 'notification-lifecycle', publicBasePath: '' },
    notification: {
      channels: { email: { provider: 'barrier' } },
    },
  });
  const app = new Application({
    config,
    paths: createAppPaths({ rootDir: root }),
  });
  app.addServiceProviders([
    Dependencies,
    JobExecutorServiceProvider,
    NotificationProvider,
    ChannelExtension,
    InstallationBoundary,
  ]);
  app.registerProviders();
  // The service caches executors by scope, so this is the one Notification uses.
  const executor = app.container
    .resolve(jobExecutorServiceToken)
    .getJobExecutor('@nocobase/app-plugin-notification');
  const setup = vi.spyOn(executor, 'setup');
  const executorShutdown = vi.spyOn(executor, 'shutdown');
  const manager = app.container.resolve(notificationRuntimeToken);
  expect(manager.store).toBeInstanceOf(DatabaseNotificationStore);
  const listReady = vi.spyOn(manager.store, 'listReady');
  const recoverExpired = vi.spyOn(manager.store, 'recoverExpired');
  const close = manager.close.bind(manager);
  vi.spyOn(manager, 'close').mockImplementation(async () => {
    closingEntered.resolve();
    await close();
  });
  let shutdownSettled = false;
  const starting = app.start();
  // Surface startup errors immediately rather than leaving the boot barrier hanging.
  void starting.catch((error: unknown) => bootEntered.reject(error));
  try {
    await bootEntered.promise;
    expect(await tablePresence()).toEqual([false, false, false, false]);
    expect(databaseAccess).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
    expect(reconcileStart).not.toHaveBeenCalled();
    expect(listReady).not.toHaveBeenCalled();
    expect(recoverExpired).not.toHaveBeenCalled();
    expect(events).toEqual([]);

    migrate.resolve();
    await starting;
    expect(await tablePresence()).toEqual([true, true, true, true]);
    expect(setup).toHaveBeenCalledOnce();
    expect(reconcileStart).toHaveBeenCalledOnce();
    expect(events).toEqual(['migrations.complete']);

    const result = await app.container.resolve(notificationServiceToken).send({
      idempotencyKey: 'application-lifecycle',
      messages: { email: { body: 'Application shutdown barrier' } },
    });
    notificationId = result.notificationId;
    await sendEntered.promise;
    const shuttingDown = app.shutdown().then(() => {
      shutdownSettled = true;
    });
    await closingEntered.promise;
    await setImmediate();
    expect(shutdownSettled).toBe(false);
    expect(providerClose).not.toHaveBeenCalled();
    // Notification is shutting its executor down, which waits for the send.
    expect(executorShutdown).toHaveBeenCalledOnce();
    expect(dependenciesClosed).toBe(false);
    expect(await manager.store.getLog(notificationId)).toMatchObject({
      status: 'processing',
    });

    releaseSend.resolve();
    await shuttingDown;
    expect(shutdownSettled).toBe(true);
    expect(providerClose).toHaveBeenCalledOnce();
    expect(dependenciesClosed).toBe(true);
    expect(events).toEqual([
      'migrations.complete',
      'channel.create',
      'provider.create',
      'send.enter',
      'send.database-open',
      'send.return',
      'provider.close',
      'database.close',
    ]);
    expect(terminalDetails).toMatchObject({
      log: { id: notificationId, status: 'completed' },
      deliveries: [
        {
          delivery: expect.objectContaining({
            status: 'accepted',
            attemptCount: 1,
          }),
          attempts: [
            expect.objectContaining({
              status: 'accepted',
              providerMessageId: 'barrier-accepted',
            }),
          ],
        },
      ],
    });
  } finally {
    migrate.resolve();
    releaseSend.resolve();
    await starting.catch(() => undefined);
    await app.shutdown();
    if (!dependenciesClosed) await database.destroy();
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  }
});
