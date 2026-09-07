import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as databaseExports from '@nocobase/db';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import {
  defineServerPlugins,
  resolveAppServerPlugins,
} from '@nocobase/app-server/plugins';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { createCaching } from '@nocobase/caching';
import { createMigrator, databaseManagerToken } from '@nocobase/db';
import authentication, {
  authenticationConfig,
} from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';
import audit, { auditConfig } from '@nocobase/app-plugin-audit/server';
import { auditExampleRoutes } from '../../skills/nocobase-app-plugin-audit/examples/http.js';
import {
  createPortableFixture,
  dialects,
} from '../helpers/database-fixtures.js';
export interface SkillsApp {
  readonly f: Awaited<ReturnType<typeof createPortableFixture>>;
  readonly app: Application;
  make(): Application;
  close(): Promise<void>;
}

export async function createSkillsApp(
  dialect: (typeof dialects)[number],
  enabled: boolean = true,
  overrides: Partial<AuditConfig> = {},
  additionalStore: boolean = false,
): Promise<SkillsApp> {
  const primary = await createPortableFixture(dialect);
  const secondary = additionalStore
    ? await createPortableFixture(dialect, true, 'other')
    : undefined;
  const manager = secondary
    ? databaseExports.createDatabaseManager({
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
  await f.connection.builder.createCollection(
    'audit_example_items',
    (table) => {
      table.string('id').primary();
      table.string('name');
    },
  );
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
        secret: 'G21-synthetic-server-authentication-secret',
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
    app.addRoutes(auditExampleRoutes);
    app.addRoutes(
      defineApiRoutes(({ container }) => {
        const routes = new Hono();
        routes.post(
          '/g21/insert',
          container.resolve(authenticationToken).required(),
          async (context) => {
            await f.connection.query
              .insertInto('audit_example_items')
              .values({ id: 'after', name: 'G21-value-sentinel' })
              .execute();
            return context.json({ inserted: true });
          },
        );
        return routes;
      }),
    );
    return app;
  };
  const app = make();
  return {
    f,
    app,
    make,
    async close() {
      await app.shutdown();
      await caching.dispose();
      await f.cleanup();
    },
  };
}
