import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { isolateWorkspacePackages } from '../../scripts/smoke-registry-config.mjs';

test('workspace packages cannot fall through to upstream, while external scoped packages can', () => {
  const config = fs.readFileSync(
    new URL('../../.github/verdaccio/config.yaml', import.meta.url),
    'utf8',
  );
  const result = isolateWorkspacePackages(config, [
    { name: '@nocobase/create-app' },
    { name: '@nocobase/docs', private: true },
  ]);
  const rule = result.slice(
    result.indexOf('  "@nocobase/create-app":'),
    result.indexOf("  '@nocobase/*':"),
  );
  assert.match(rule, /publish: \$authenticated/u);
  assert.doesNotMatch(rule, /proxy:/u);
  assert.doesNotMatch(result, /"@nocobase\/docs":/u);
  assert.ok(result.endsWith(config.split('packages:\n')[1]));
});

test('refuses a registry configuration that would silently leave upstream enabled', () => {
  assert.throws(() => isolateWorkspacePackages('', [{ name: 'example' }]));
  assert.throws(() => isolateWorkspacePackages('packages:\n', []));
});
