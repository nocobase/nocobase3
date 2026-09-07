import { fileURLToPath } from 'node:url';
import { createMigrator, type DatabaseDialect } from '@nocobase/db';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import { TrustedAuditRuntime } from '../../server/runtime.js';
import { createAuditHttpResources } from '../../server/providers/http.js';
import { createAuditQueryResources } from '../../server/providers/routes.js';
import { createAuditApiRoutes } from '../../server/routes/index.js';
import { createAuditDatabaseResourceAdapter } from '../../server/query-resource.js';
import { auditPermissionId } from '../../server/authorization.js';
import { normalizeEvent } from '../../server/event-normalizer.js';
import { PortableAuditStore } from '../../server/store.js';
import type { ResourceRef, TrustedAuditScope } from '../../server/contracts.js';
import { createPortableFixture, auditRaw } from './database-fixtures.js';

export interface QueryFixture {
  f: Awaited<ReturnType<typeof createPortableFixture>>;
  alice: { id: string; cookie: string };
  bob: { id: string; cookie: string };
  app: Application<AppConfig>;
  appAuthorization: ReturnType<typeof createAppAuthorization>;
  resources: ReturnType<typeof createAuditQueryResources>;
  settings: PersistentAuditSettingsService;
  health: LocalAuditHealthService;
  runtime: TrustedAuditRuntime;
  grant(
    id: string,
    actions: string[],
    settingsActions?: string[],
    resourceRead?: boolean,
  ): Promise<void>;
  append(
    id: string,
    target?: ResourceRef,
    scope?: TrustedAuditScope,
  ): Promise<void>;
  target(key: string): string;
  request(path: string, cookie?: string, init?: RequestInit): Promise<Response>;
  cleanup(): Promise<void>;
}

export async function createQueryFixture(
  dialect: DatabaseDialect,
  required: boolean = false,
): Promise<QueryFixture> {
  const f = await createPortableFixture(dialect);
  const cleanup: (() => Promise<void>)[] = [f.cleanup];
  try {
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
    await auditRaw(
      f.connection,
      'CREATE TABLE "g11_documents" ("id" VARCHAR(80) PRIMARY KEY, "owner_id" VARCHAR(80), "tenant" VARCHAR(80))',
    );
    const auth = new Auth({
      connection: f.connection,
      baseURL: 'http://localhost/api/auth',
      secret: 'g11-synthetic-secret-at-least-thirty-two-characters',
      advanced: { cookiePrefix: 'g11' },
    });
    async function user(name: string) {
      const response = await auth.handler(
        new Request('http://localhost/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            email: name + '@example.test',
            password: 'synthetic password with enough length',
          }),
        }),
      );
      if (response.status !== 200)
        throw new Error('Synthetic signup failed: ' + response.status);
      const body = (await response.json()) as { user: { id: string } };
      return {
        id: body.user.id,
        cookie: response.headers.get('set-cookie') ?? '',
      };
    }
    const alice = await user('alice');
    const bob = await user('bob');
    await auditRaw(
      f.connection,
      'INSERT INTO "g11_documents" ("id", "owner_id", "tenant") VALUES (?, ?, ?), (?, ?, ?)',
      ['a', alice.id, 'tenant-a', 'b', bob.id, 'tenant-a'],
    );
    const appAuthorization = createAppAuthorization({
      connection: f.connection,
    });
    appAuthorization.database.collections.add({
      name: 'main.documents',
      actions: ['read'],
      fields: ['id', 'ownerId', 'tenant'],
      attributes: { identifier: 'id', owner: 'ownerId' },
    });
    const config = new AppConfig([
      {
        ...appConfig,
        defaults: {
          name: 'main',
          publicBasePath: '',
          internalBasePath: '',
          publicApiUrl: '/api',
        },
      },
    ]);
    await config.loadAll();
    const app = new Application({
      config,
      paths: createConfigPaths({ rootDir: '/synthetic/g11' }),
      websocket: () => async () => null,
    });
    cleanup.push(() => app.shutdown());
    app.container.instance(authenticationToken, auth);
    app.container.instance(authorizationToken, appAuthorization);
    const runtime = new TrustedAuditRuntime({
      appId: f.scope.appId,
      securityScope: f.scope.securityScope,
      carrier: new NodeAuditScopeCarrier(f.scope.appId),
      bind: () => f.recorder,
      diagnostic: () => undefined,
    });
    const health = new LocalAuditHealthService(() => undefined);
    const catalog = new AuditCaptureCatalog();
    const readiness = new AuditReadiness({
      stores: [{ connection: f.connection, store: f.store }],
      catalog,
      health,
      requirements: {
        auditRequired: required,
        requiredDataSources: [],
        mandatorySources: required ? ['request'] : [],
      },
    });
    const settings = new PersistentAuditSettingsService({
      connection: f.connection,
      store: f.store,
      readiness,
      health,
      defaults: {
        enabled: true,
        sources: { http: 'declared-routes', runtime: 'disabled', database: [] },
      },
    });
    const initial = await settings.initialize(f.scope);
    const http = createAuditHttpResources({
      application: app,
      runtime,
      settings,
      stores: [f.store],
      health,
      catalog,
      connections: [f.connection],
    });
    cleanup.push(async () => {
      await http.dispose();
      runtime.dispose();
    });
    const resources = createAuditQueryResources({
      boundary: f.scope,
      stores: ['main'],
      adapters: [
        createAuditDatabaseResourceAdapter({
          connection: f.connection,
          resource: 'documents',
          table: 'g11_documents',
          keyFields: ['id'],
          boundaryFilter: { $and: [{ tenant: { $eq: 'tenant-a' } }] },
        }),
      ],
      eventStores: [f.store],
      configurationStore: f.store,
      settings,
      appAuthorization,
    });
    app.addRoutes(
      createAuditApiRoutes({
        ...resources,
        settings,
        health,
        http: http.collector,
        runtime,
        configurationStore: 'main',
      }),
    );
    await http.verify(async () => {
      await app.fetch(new Request('http://localhost/__g11_probe'));
    });
    await readiness.start(initial);
    let permissionIndex = 0;
    async function grant(
      id: string,
      actions: string[],
      settingsActions: string[] = [],
      resourceRead: boolean = true,
    ) {
      const key = 'g11-' + ++permissionIndex;
      await appAuthorization.permissionSets.create({
        key,
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId(f.scope, 'main'),
            },
            actions: actions.map((action) => ({ action })),
          },
          {
            resource: {
              type: 'audit.settings',
              id: auditPermissionId(f.scope, 'main'),
            },
            actions: settingsActions.map((action) => ({ action })),
          },
          ...(resourceRead
            ? [
                appAuthorization.database.grant('main.documents', {
                  read: {
                    fields: { output: ['id'] },
                    recordAccess: ['recordsIOwn'],
                  },
                }),
              ]
            : []),
        ],
      });
      await appAuthorization.permissionSets.assign({
        subject: { type: 'user', id },
        permissionSet: key,
      });
    }
    async function append(
      id: string,
      target: ResourceRef = {
        dataSource: 'main',
        resource: 'documents',
        key: 'a',
      },
      scope: TrustedAuditScope = f.scope,
    ) {
      const store =
        scope.appId === f.scope.appId &&
        scope.securityScope === f.scope.securityScope
          ? f.store
          : new PortableAuditStore(f.connection, { ...scope, store: 'main' });
      if (store !== f.store) await store.prepare();
      const event = normalizeEvent(
        {
          action: 'synthetic.read',
          outcome: 'success',
          target,
          details: { safe: 'metadata-sentinel' },
        },
        {
          scope: {
            ...scope,
            actor: { type: 'user', id: 'historical', label: 'private-label' },
            operationId: 'same-operation',
          },
          kind: 'business',
          producer: 'synthetic-g11',
          id,
          occurredAt: '2026-09-05T00:00:00.000Z',
          recordedAt: '2026-09-05T00:00:00.000Z',
          store: 'main',
          policyVersion: 1,
        },
      );
      await store.append(event.event);
    }
    const target = (key: string): string =>
      encodeURIComponent(
        JSON.stringify({ dataSource: 'main', resource: 'documents', key }),
      );
    const request = async (
      path: string,
      cookie: string = alice.cookie,
      init: RequestInit = {},
    ): Promise<Response> =>
      app.fetch(
        new Request('http://localhost/api/audit' + path, {
          ...init,
          headers: { cookie, ...init.headers },
        }),
      );
    return {
      f,
      alice,
      bob,
      app,
      appAuthorization,
      resources,
      settings,
      health,
      runtime,
      grant,
      append,
      target,
      request,
      cleanup: async () => {
        for (const close of cleanup.reverse()) await close();
      },
    };
  } catch (error) {
    for (const close of cleanup.reverse()) await close();
    throw error;
  }
}
