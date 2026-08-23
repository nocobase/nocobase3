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
    inspection.routes.map(({ id, path }) => ({ id, path })),
    [
      {
        id: '@nocobase/app-plugin-routes-example:index',
        path: '/routes-example',
      },
    ],
  );
  assert.deepEqual(
    inspection.providers.map(({ id, order }) => ({ id, order })),
    [
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        order: 1,
      },
    ],
  );

  const output = formatAppClientInspection(inspection);
  assert.match(output, /Routes/u);
  assert.match(output, /Providers \(outer -> inner\)/u);

  assert.deepEqual(selectAppClientInspection(inspection, 'routes'), {
    app: '@nocobase/app-template-default',
    routes: inspection.routes,
  });
});
