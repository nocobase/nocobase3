import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import {
  defineServerPlugins,
  resolveAppServerPlugins,
} from '@nocobase/app-server/plugins';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { createCaching } from '@nocobase/caching';
import {
  createDatabaseManager,
  createMigrator,
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseDialect,
} from '@nocobase/db';
import authentication, {
  authenticationConfig,
} from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
import audit, { auditConfig, type AuditConfig } from '../../server/index.js';
import {
  auditCompositionToken,
  type AuditComposition,
} from '../../server/providers/composition.js';
import type { AuditEventDto } from '../../server/contracts.js';
import { storedText } from '../../server/database/sql-client.js';
import {
  createPortableFixture,
  auditRows,
  dialects,
  type PortableFixture,
} from './database-fixtures.js';
import { runCouplingCleanup } from './system-teardown.js';

export interface ProductionApp {
  readonly f: PortableFixture;
  readonly app: Application;
  make(): Application;
  close(): Promise<void>;
}

export async function createProductionApp(
  dialect: (typeof dialects)[number],
  enabled: boolean = true,
  overrides: Partial<AuditConfig> = {},
  additionalStore: boolean = false,
): Promise<ProductionApp> {
  const primary = await createPortableFixture(dialect);
  const secondary = additionalStore
    ? await createPortableFixture(dialect, true, 'other')
    : undefined;
  const manager = secondary
    ? createDatabaseManager({
        default: 'main',
        connections: { main: primary.config, other: secondary.config },
      })
    : primary.manager;
  const f = {
    ...primary,
    manager,
    connection: manager.connection('main'),
    cleanup: async () => {
      if (secondary) await manager.destroy();
      await primary.cleanup();
      await secondary?.cleanup();
    },
  };
  const caching = createCaching();
  await f.connection.builder.createCollection('audit_items', (table) => {
    table.string('id').primary();
    table.string('name');
  });
  for (const name of ['authentication', 'authorization'])
    await createMigrator({
      database: f.manager,
      packageName: '@nocobase/app-plugin-' + name,
      directory: fileURLToPath(
        new URL(
          '../../../app-plugin-' + name + '/database/migrations',
          import.meta.url,
        ),
      ),
    }).latest();
  const config = new AppConfig([
    {
      ...appConfig,
      defaults: {
        name: 'main',
        publicOrigin: 'http://localhost',
        publicBasePath: '',
        internalBasePath: '',
        publicApiUrl: '/api',
      },
    },
    {
      ...authenticationConfig,
      defaults: {
        secret: 'COMPOSITION-synthetic-server-authentication-secret',
        emailAndPassword: { enabled: true, autoSignIn: true },
        session: { storeSessionInDatabase: true },
      },
    },
    { ...auditConfig, defaults: { ...auditConfig.defaults, ...overrides } },
  ]);
  await config.loadAll();
  const make = (): Application => {
    const app = new Application<
      import('@nocobase/app-server/config').AppConfigAccessor
    >({
      config,
      paths: createConfigPaths({ rootDir: f.directory }),
      websocket: () => async () => null,
    });
    app.container.instance(databaseManagerToken, f.manager);
    app.container.instance(cachingToken, caching);
    app.container.instance(idGeneratorToken, {
      generate: () => 1,
      generateString: () => randomUUID(),
    });
    app.addServerPlugins(
      resolveAppServerPlugins(
        fileURLToPath(
          new URL(
            '../../../../templates/app-template-default',
            import.meta.url,
          ),
        ),
        defineServerPlugins([
          authentication,
          authorization,
          ...(enabled ? [audit] : []),
        ]),
      ),
    );
    return app;
  };
  const app = make();
  return {
    f,
    app,
    make,
    async close() {
      await runCouplingCleanup([
        { name: 'application shutdown', run: () => app.shutdown() },
        { name: 'cache disposal', run: () => caching.dispose() },
        { name: 'database cleanup', run: f.cleanup },
      ]);
    },
  };
}
export interface CouplingFixture {
  app: Application;
  composition: AuditComposition;
  main: DatabaseConnection;
  observation: DatabaseConnection;
  request(path: string, init?: RequestInit): Promise<Response>;
  events(store?: 'main' | 'observation'): Promise<AuditEventDto[]>;
  rows(): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

/** Each App owns two random databases; no shared service is stopped or altered. */
export async function createCouplingFixture(
  dialect: DatabaseDialect,
  routes: (composition: AuditComposition, main: DatabaseConnection) => Hono,
  outer?: (app: Application, main: DatabaseConnection) => void,
): Promise<CouplingFixture> {
  const primary = await createPortableFixture(dialect);
  const cleanups: (() => Promise<void>)[] = [primary.cleanup];
  const close = async (): Promise<void> => {
    await runCouplingCleanup(
      cleanups
        .splice(0)
        .reverse()
        .map((run, index) => ({ name: 'fixture resource ' + index, run })),
    );
  };
  try {
    const secondary = await createPortableFixture(dialect, true, 'observation');
    cleanups.push(secondary.cleanup);
    const manager = createDatabaseManager({
      default: 'main',
      connections: { main: primary.config, observation: secondary.config },
    });
    cleanups.push(() => manager.destroy());
    const main = manager.connection('main');
    const observation = manager.connection('observation');
    await main.builder.createCollection('transaction_items', (table) => {
      table.string('id').primary();
      table.string('value');
    });
    for (const name of ['authentication', 'authorization']) {
      await createMigrator({
        database: manager,
        packageName: '@nocobase/app-plugin-' + name,
        directory: fileURLToPath(
          new URL(
            '../../../app-plugin-' + name + '/database/migrations',
            import.meta.url,
          ),
        ),
      }).latest();
    }
    const config = new AppConfig([
      {
        ...appConfig,
        defaults: {
          name: 'main',
          publicOrigin: 'http://localhost',
          publicBasePath: '',
          internalBasePath: '',
          publicApiUrl: '/api',
        },
      },
      {
        ...authenticationConfig,
        defaults: {
          secret: 'TRANSACTION-synthetic-authentication-secret',
          emailAndPassword: { enabled: true, autoSignIn: true },
          session: { storeSessionInDatabase: true },
        },
      },
      {
        ...auditConfig,
        defaults: {
          ...auditConfig.defaults,
          stores: ['main', 'observation'],
          defaults: {
            enabled: true,
            observationStore: 'observation',
            sources: {
              http: 'declared-routes',
              runtime: 'integrated-producers',
              database: [{ dataSource: 'main', table: 'transaction_items' }],
            },
          },
        },
      },
    ]);
    await config.loadAll();
    const caching = createCaching();
    cleanups.push(() => caching.dispose());
    const app = new Application<
      import('@nocobase/app-server/config').AppConfigAccessor
    >({
      config,
      paths: createConfigPaths({ rootDir: primary.directory }),
      websocket: () => async () => null,
    });
    cleanups.push(() => app.shutdown());
    app.container.instance(databaseManagerToken, manager);
    app.container.instance(cachingToken, caching);
    app.container.instance(idGeneratorToken, {
      generate: () => 1,
      generateString: () => randomUUID(),
    });
    app.addServerPlugins(
      resolveAppServerPlugins(
        fileURLToPath(
          new URL(
            '../../../../templates/app-template-default',
            import.meta.url,
          ),
        ),
        defineServerPlugins([authentication, authorization, audit]),
      ),
    );
    outer?.(app, main);
    // Synthetic fault routes are intentionally anonymous and only exercised
    // through App.fetch or a loopback-only server. Real ACL providers remain
    // installed, while the query API tests exercise their access restrictions.
    app.addRoutes(
      defineApiRoutes(() =>
        routes(app.container.resolve(auditCompositionToken), main),
      ),
    );
    await app.start();
    return {
      app,
      main,
      observation,
      composition: app.container.resolve(auditCompositionToken),
      request: async (path, init) =>
        app.fetch(
          new Request('http://localhost/api/transactions' + path, init),
        ),
      events: async (store = 'main') =>
        (
          await auditRows(
            manager.connection(store),
            'SELECT "payload" FROM "auditEvents"',
          )
        ).map((row) => JSON.parse(storedText(row, 'payload')) as AuditEventDto),
      rows: () =>
        auditRows(main, 'SELECT * FROM "transaction_items" ORDER BY "id"'),
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'setup and cleanup failed.',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

export interface Gate {
  promise: Promise<void>;
  release(): void;
}
export function gate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Bound synchronization failures without substituting timing for ordering. */
export async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('synchronization timed out.')),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
