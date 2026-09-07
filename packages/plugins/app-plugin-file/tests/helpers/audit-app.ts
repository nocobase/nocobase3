import type { DatabaseDialect } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import type { AppConfig } from '@nocobase/app-server/config';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import {
  NodeAuditScopeCarrier,
  TrustedAuditRuntime,
  PersistentAuditSettingsService,
  AuditCaptureCatalog,
  AuditReadiness,
  LocalAuditHealthService,
  createAuditHttpResources,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import { createPortableFixture } from '../../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { createAuthenticatedApp } from '../../../app-plugin-audit/tests/helpers/authenticated-app.js';

export async function createAuditAuthApp(
  dialect: DatabaseDialect,
  configure?: (
    app: Application<AppConfig>,
    auth: import('@nocobase/app-plugin-authentication').Auth,
  ) => Promise<void> | void,
  bridgeEnabled: boolean = true,
) {
  const fixture = await createPortableFixture(dialect);
  const authenticated = await createAuthenticatedApp(fixture);
  const { app } = authenticated;
  const carrier = new NodeAuditScopeCarrier(fixture.scope.appId);
  const runtime = new TrustedAuditRuntime({
    appId: fixture.scope.appId,
    carrier,
    bind: (scope) =>
      bindAuditRecorder(scope, {
        producer: 'file',
        store: fixture.store,
        policy: async () => {
          const policy = await settings.snapshot(scope);
          return {
            revision: policy.revision,
            enabled: policy.enabled && policy.sources.runtime !== 'disabled',
            maxDetailsBytes: policy.maxDetailsBytes,
          };
        },
      }),
    diagnostic: () => undefined,
  });
  const health = new LocalAuditHealthService(() => undefined);
  const catalog = new AuditCaptureCatalog();
  const business = catalog.register({
    producer: 'file',
    kind: 'business',
    connection: fixture.connection,
    targets: [],
    dispose: () => undefined,
  });
  const readiness = new AuditReadiness({
    stores: [{ connection: fixture.connection, store: fixture.store }],
    catalog,
    health,
    requirements: {
      auditRequired: false,
      requiredDataSources: [],
      mandatorySources: [],
    },
  });
  const settings = new PersistentAuditSettingsService({
    connection: fixture.connection,
    store: fixture.store,
    readiness,
    health,
    defaults: {
      enabled: true,
      sources: {
        http: 'declared-routes',
        runtime: 'integrated-producers',
        database: ['audit_files', 'other_audit_files'].map((table) => ({
          dataSource: 'main',
          table,
        })),
      },
    },
  });
  const initial = await settings.initialize(fixture.scope);
  const resources = createAuditHttpResources({
    application: app,
    runtime,
    settings,
    stores: [fixture.store],
    health,
    catalog,
    connections: [fixture.connection],
  });
  if (bridgeEnabled)
    app.container.instance(authenticationAuditToken, {
      runtime,
      collector: resources.collector,
    });
  await configure?.(app, authenticated.auth);
  return {
    ...authenticated,
    start: async () => {
      await resources.verify(async () => {
        await app.fetch(new Request('http://localhost/probe'));
      });
      await business.verify(async () => {
        await runtime.runRequest(() =>
          runtime.recorder.record({ action: 'file.probe', outcome: 'success' }),
        );
      });
      await readiness.start(initial);
    },
    fixture,
    runtime,
    carrier,
    health,
    catalog,
    collector: resources.collector,
    settings,
    events: async () =>
      (
        await fixture.store.query(fixture.scope, {
          store: 'main',
          pageSize: 100,
        })
      ).items,
    close: async () => {
      await business.dispose();
      await resources.dispose();
      runtime.dispose();
      await authenticated.close();
      await fixture.cleanup();
    },
  };
}

export { jsonRequest } from '../../../app-plugin-audit/tests/helpers/authenticated-app.js';
