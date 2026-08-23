import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  formatAppClientInspection,
  inspectAppClient,
  parseInspectAppClientArgs,
  selectAppClientInspection,
} from '../../scripts/inspect-app-client.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('parses app client inspection options', () => {
  assert.deepEqual(
    parseInspectAppClientArgs([
      '--app',
      '@nocobase/app-template-default',
      '--type',
      'providers',
      '--json',
    ]),
    {
      app: '@nocobase/app-template-default',
      help: false,
      json: true,
      type: 'providers',
    },
  );
});

test('inspects configured client routes and providers', async () => {
  const inspection = await inspectAppClient({ repoRoot });

  assert.equal(inspection.app, '@nocobase/app-template-default');
  assert.deepEqual(
    inspection.routes.map(({ auth, id, path }) => ({ auth, id, path })),
    [
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:login',
        path: '/login',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:register',
        path: '/register',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:forgot-password',
        path: '/forgot-password',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:reset-password',
        path: '/reset-password',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-notification-provider:demo',
        path: '/notification-provider',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-routes-example:index',
        path: '/routes-example',
      },
    ],
  );
  assert.deepEqual(
    inspection.providers.map(({ id, order }) => ({ id, order })),
    [
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        order: 1,
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        order: 2,
      },
    ],
  );

  const output = formatAppClientInspection(inspection);
  assert.match(output, /Routes/u);
  assert.match(output, /auth: guest/u);
  assert.match(output, /route source: plugin/u);
  assert.match(output, /component source: application/u);
  assert.match(output, /client\/auth\/pages\/login-page/u);
  assert.match(output, /Providers \(outer -> inner\)/u);

  assert.deepEqual(
    inspection.routes
      .filter(({ packageName }) =>
        packageName.endsWith('app-plugin-authentication'),
      )
      .map(({ componentEntry, componentSource, routeSource }) => ({
        componentEntry,
        componentSource,
        routeSource,
      })),
    [
      './client/auth/pages/login-page',
      './client/auth/pages/register-page',
      './client/auth/pages/forgot-password-page',
      './client/auth/pages/reset-password-page',
    ].map((componentEntry) => ({
      componentEntry,
      componentSource: 'application',
      routeSource: 'plugin',
    })),
  );

  assert.deepEqual(selectAppClientInspection(inspection, 'routes'), {
    app: '@nocobase/app-template-default',
    routes: inspection.routes,
  });
});
