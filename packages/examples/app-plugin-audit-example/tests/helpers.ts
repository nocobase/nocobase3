import type { AuditWriter } from '@nocobase/audit';
import type { DatabaseManager } from '@nocobase/db';
import { resolve } from 'node:path';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import authorizationPlugin from '@nocobase/app-plugin-authorization/server';
import authentication from '@nocobase/app-plugin-authentication/server';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import auditPlugin, {
  auditServiceToken,
  type AuditConfig,
} from '@nocobase/app-plugin-audit/server';
import { AppConfig, createAppPaths } from '@nocobase/app-server/config';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  queueManagerToken,
  queueJobFactoryRegistryToken,
} from '@nocobase/app-server/queue';
import {
  createQueueManager,
  createSyncQueueConfig,
  createQueueJobFactoryRegistry,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { vi } from 'vitest';
import { apiRoutes } from '../server/routes/index.js';
import { AuditExampleProvider } from '../server/providers/audit-example.js';
import { createCustomerAuditWriter } from '../server/writer.js';

function _hostLogging(container: ServiceContainer) {
  return container.resolve(loggingToken);
}

export async function createFixture(
  output?: (database: DatabaseManager) => AuditWriter,
) {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const migrator = database.createMigrator({
    directory: resolve(import.meta.dirname, '../database/migrations'),
    packageName: '@nocobase/app-plugin-audit-example',
  });
  await migrator.latest();
  await database
    .createMigrator({
      directory: resolve(
        authentication.baseDir,
        authentication.database!.migrations!,
      ),
      packageName: authentication.packageName,
    })
    .latest();
  const auth = new Auth({
    connection: database.connection(),
    baseURL: 'http://localhost/api/auth',
    secret: 'audit-example-test-secret-at-least-32-characters',
    appName: 'audit-example',
    session: { cookieCache: { enabled: false } },
  });
  await database
    .createMigrator({
      directory: resolve(
        authorizationPlugin.baseDir,
        authorizationPlugin.database!.migrations!,
      ),
      packageName: authorizationPlugin.packageName,
    })
    .latest();
  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authenticationToken, auth);
  container.instance(authorizationToken, authorization);
  const factory = createQueueJobFactoryRegistry(() => {
    throw new Error('Unregistered test job');
  });
  const queue = createQueueManager(createSyncQueueConfig(), {
    jobFactory: (JobClass) => factory.create(JobClass),
  });
  container.instance(queueJobFactoryRegistryToken, factory);
  container.instance(queueManagerToken, queue);
  const report = vi.fn();
  container.instance(loggingToken, {
    getLogger: () => ({ error: report }),
  } as unknown as ReturnType<typeof _hostLogging>);
  const writer = output
    ? output(database)
    : createCustomerAuditWriter(database);
  const write = vi.fn((event: Parameters<typeof writer.write>[0]) =>
    writer.write(event),
  );
  const audit: AuditConfig = { createWriter: () => ({ writer: { write } }) };
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({ audit });
  const router = new Hono();
  const app = {
    appName: 'audit-example',
    publicBasePath: '/',
    config,
    paths: createAppPaths({ rootDir: '/tmp/audit-example-test' }),
    container,
    router,
  };
  const AuditProvider = auditPlugin.serviceProviders[0]!;
  const auditProvider = new AuditProvider(app);
  auditProvider.register?.();
  await auditProvider.boot?.();
  const provider = new AuditExampleProvider(app);
  provider.register();
  await provider.boot();
  router.on(['GET', 'POST'], '/api/auth/*', (context) =>
    auth.handler(context.req.raw),
  );
  router.route('/api', await apiRoutes.createRouter(app));
  router.get('/api/unrelated', (context) => context.json({ ok: true }));
  async function signup(name: string) {
    const response = await router.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${name}@example.test`,
        password: 'correct horse battery staple',
        name,
        username: name,
      }),
    });
    if (response.status !== 200)
      throw new Error(`Signup failed: ${await response.text()}`);
    const result = (await response.json()) as { user: { id: string } };
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    return { cookie, id: result.user.id };
  }
  const alice = await signup('alice');
  const bob = await signup('bob');
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    cookie = alice.cookie,
  ) =>
    router.request(`/api/audit-example${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function close() {
    await provider.shutdown();
    await queue.close();
    await auditProvider.shutdown?.();
    await database.destroy();
  }
  return {
    database,
    migrator,
    container,
    router,
    app,
    alice,
    bob,
    auth,
    request,
    report,
    write,
    queue,
    close,
    audit: container.resolve(auditServiceToken),
  };
}
