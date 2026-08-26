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
  assert.equal(
    parseInspectAppClientArgs(['--type', 'bootstrap']).type,
    'bootstrap',
  );
});

test('inspects configured client routes and providers', async () => {
  const inspection = await inspectAppClient({ repoRoot });

  assert.equal(inspection.app, '@nocobase/app-template-default');
  assert.deepEqual(
    inspection.routes.map(({ auth, id, path }) => ({ auth, id, path })),
    [
      {
        auth: 'required',
        id: '@nocobase/app-template-default:home',
        path: '/',
      },
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
        id: '@nocobase/app-plugin-authorization:permission-sets',
        path: '/settings/authorization/permission-sets',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-authorization:default-access',
        path: '/settings/authorization/default-access',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-authorization:sharing-rules',
        path: '/settings/authorization/sharing-rules',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-authorization:restriction-rules',
        path: '/settings/authorization/restriction-rules',
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
        id: '@nocobase/app-template-default:theme',
        order: 1,
      },
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        order: 2,
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        order: 3,
      },
    ],
  );
  assert.deepEqual(
    inspection.bootstraps.map(({ order, packageName, source }) => ({
      order,
      packageName,
      source,
    })),
    [
      {
        order: 1,
        packageName: '@nocobase/app-template-default',
        source: 'application',
      },
      {
        order: 2,
        packageName: '@nocobase/app-plugin-authentication',
        source: 'plugin',
      },
      {
        order: 3,
        packageName: '@nocobase/app-plugin-authorization',
        source: 'plugin',
      },
      {
        order: 4,
        packageName: '@nocobase/app-plugin-data-provider',
        source: 'plugin',
      },
      {
        order: 5,
        packageName: '@nocobase/app-plugin-notification-provider',
        source: 'plugin',
      },
    ],
  );

  const output = formatAppClientInspection(inspection);
  assert.match(output, /Bootstrap order/u);
  assert.match(output, /Routes/u);
  assert.match(output, /auth: guest/u);
  assert.match(output, /route source: plugin/u);
  assert.match(output, /component source: application/u);
  assert.match(
    output,
    /client\/extensions\/nocobase-auth-ui\/pages\/login-page/u,
  );
  assert.match(output, /Providers \(outer -> inner\)/u);
  assert.match(output, /layer: root/u);

  assert.deepEqual(inspection.routes[0], {
    auth: 'required',
    id: '@nocobase/app-template-default:home',
    name: 'home',
    packageName: '@nocobase/app-template-default',
    path: '/',
    entry: './client/routes',
    routeSource: 'application',
    routeEntry: './client/routes',
    componentSource: 'application',
    componentEntry: undefined,
  });
  assert.deepEqual(
    inspection.providers.map(({ id, layer, source }) => ({
      id,
      layer,
      source,
    })),
    [
      {
        id: '@nocobase/app-template-default:theme',
        layer: 'root',
        source: 'application',
      },
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        layer: 'extension',
        source: 'plugin',
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        layer: 'extension',
        source: 'plugin',
      },
    ],
  );

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
      './client/extensions/nocobase-auth-ui/pages/login-page',
      './client/extensions/nocobase-auth-ui/pages/register-page',
      './client/extensions/nocobase-auth-ui/pages/forgot-password-page',
      './client/extensions/nocobase-auth-ui/pages/reset-password-page',
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
  assert.deepEqual(selectAppClientInspection(inspection, 'bootstrap'), {
    app: '@nocobase/app-template-default',
    bootstraps: inspection.bootstraps,
  });
});
