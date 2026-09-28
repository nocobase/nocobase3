import assert from 'node:assert/strict';
import test from 'node:test';

import { OFFICIAL_DIALECTS } from '../../packages/app/app-server/src/database/resolve-config.ts';
import { dialects as smokeDialects } from '../../scripts/smoke-database-config.mjs';
import { databases as integrationDatabases } from '../../scripts/select-db-integration-matrix.mjs';

// The runtime's list is authoritative: it is typed against the loaders, so a dialect added there without a driver,
// or a driver without a dialect, fails to compile. These scripts run under plain Node and cannot import it, so they
// keep their own copies — and a copy that falls behind fails quietly, as a dialect CI never tests or a local
// registry run that rejects a dialect the runtime supports. This is what notices.
const expected = [...OFFICIAL_DIALECTS].sort();

test('the unreleased smoke test offers exactly the dialects the runtime can load', () => {
  assert.deepEqual([...smokeDialects].sort(), expected);
});

test('database integration CI covers exactly the dialects the runtime can load', () => {
  assert.deepEqual([...integrationDatabases].sort(), expected);
});
