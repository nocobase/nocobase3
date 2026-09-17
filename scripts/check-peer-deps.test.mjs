import assert from 'node:assert/strict';
import test from 'node:test';
import { isIdentitySensitive } from './check-peer-deps.mjs';

test('queue factories are not identity keys after retiring the global Locator', () => {
  assert.equal(isIdentitySensitive('@nocobase/queue'), false);
  assert.equal(isIdentitySensitive('@nocobase/app-server'), true);
  assert.equal(isIdentitySensitive('@nocobase/service-provider'), true);
  assert.equal(isIdentitySensitive('@nocobase/app-plugin-example'), true);
});
