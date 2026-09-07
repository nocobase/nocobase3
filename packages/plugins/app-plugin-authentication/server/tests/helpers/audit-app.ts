import { createCaptureServices } from '../../../../app-plugin-audit/tests/helpers/capture-services.js';
import type { DatabaseDialect } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import type { AppConfig } from '@nocobase/app-server/config';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import {
  NodeAuditScopeCarrier,
  TrustedAuditRuntime,
  createAuditHttpResources,
} from '@nocobase/app-plugin-audit/server';
import { createPortableFixture } from '../../../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { createAuthenticatedApp } from '../../../../app-plugin-audit/tests/helpers/authenticated-app.js';

export async function createAuditAuthApp(
  dialect: DatabaseDialect,
  configure?: (
    app: Application<AppConfig>,
    auth: import('../../auth.js').Auth,
  ) => Promise<void> | void,
  bridgeEnabled: boolean = true,
) {
  const fixture = await createPortableFixture(dialect);
  const authenticated = await createAuthenticatedApp(fixture);
  const { app } = authenticated;
  const runtime = new TrustedAuditRuntime({
    appId: fixture.scope.appId,
    carrier: new NodeAuditScopeCarrier(fixture.scope.appId),
    bind: () => fixture.recorder,
    diagnostic: () => undefined,
  });
  const { health, catalog, readiness, settings } = createCaptureServices([
    fixture,
  ]);
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
  await resources.verify(async () => {
    await app.fetch(new Request('http://localhost/probe'));
  });
  await readiness.start(initial);
  return {
    ...authenticated,
    fixture,
    settings,
    events: async () =>
      (
        await fixture.store.query(fixture.scope, {
          store: 'main',
          pageSize: 100,
        })
      ).items,
    close: async () => {
      await resources.dispose();
      runtime.dispose();
      await authenticated.close();
      await fixture.cleanup();
    },
  };
}

export { jsonRequest } from '../../../../app-plugin-audit/tests/helpers/authenticated-app.js';
