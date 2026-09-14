// @vitest-environment node
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFixture } from './helpers.js';

let f: Awaited<ReturnType<typeof createFixture>> | undefined;
afterEach(async () => {
  await f?.database.destroy();
  f = undefined;
});

it('creates the Permission Set and its assignment once, however often it runs', async () => {
  f = await createFixture({ grant: false });
  const seeder = f.database.createSeeder({
    directory: path.resolve(import.meta.dirname, '../database/seeds'),
    packageName: '@nocobase/app-plugin-authorization-example',
  });

  expect((await seeder.run()).executed).toHaveLength(1);
  // A replay of the seed body itself, not of the seeder's ledger.
  const connection = f.database.connection();
  await (
    await import('../database/seeds/202609150002_authorization_example_grant_members.js')
  ).default.run({ query: connection.query, connection });

  const query = connection.query;
  expect(
    await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', 'authorization-example-member')
      .execute(),
  ).toHaveLength(1);
  expect(
    await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', 'authorization-example-member')
      .execute(),
  ).toHaveLength(1);
});
