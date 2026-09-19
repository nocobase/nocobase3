// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import authentication from '@nocobase/app-plugin-authentication/server';
import authorizationPlugin from '@nocobase/app-plugin-authorization/server';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeCustomerPermissions } from '../server/authorization.js';

const key = 'audit-example-member';
let directory: string;
let database: DatabaseManager;
let otherDatabase: DatabaseManager;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'audit-permissions-'));
  const create = () =>
    createDatabaseManager({
      drivers: { sqlite },
      connections: {
        main: { dialect: 'sqlite', filename: join(directory, 'db.sqlite') },
      },
    });
  database = create();
  otherDatabase = create();
  for (const plugin of [authentication, authorizationPlugin]) {
    await database
      .createMigrator({
        directory: resolve(plugin.baseDir, plugin.database!.migrations!),
        packageName: plugin.packageName,
      })
      .latest();
  }
});

afterEach(async () => {
  await otherDatabase?.destroy();
  await database?.destroy();
  await rm(directory, { recursive: true, force: true });
});

it('allows two independent connections to initialize the same membership concurrently', async () => {
  const first = createAppAuthorization({ connection: database.connection() });
  const second = createAppAuthorization({
    connection: otherDatabase.connection(),
  });
  const bothRead = Promise.withResolvers<void>();
  let reads = 0;
  for (const authorization of [first, second]) {
    const get = authorization.permissionSets.get.bind(
      authorization.permissionSets,
    );
    vi.spyOn(authorization.permissionSets, 'get').mockImplementationOnce(
      async (name) => {
        const existing = await get(name);
        if (++reads === 2) bothRead.resolve();
        await bothRead.promise;
        return existing;
      },
    );
  }
  await Promise.all([
    initializeCustomerPermissions(first, database),
    initializeCustomerPermissions(second, otherDatabase),
  ]);
  expect(
    (await first.permissionSets.list()).filter((set) => set.key === key),
  ).toHaveLength(1);
  expect(await first.permissionSets.listAssignments(key)).toEqual([
    expect.objectContaining({
      permissionSet: key,
      subject: { type: 'authenticated', id: '*' },
    }),
  ]);
});

it('rolls back a failed assignment and completes initialization on the next startup', async () => {
  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  const client = await database
    .connection()
    .client<{ raw(sql: string): Promise<unknown> }>();
  await client.raw(`CREATE TRIGGER fail_audit_membership BEFORE INSERT ON authorization_permission_set_assignments
    WHEN NEW.permission_set_key = 'audit-example-member'
    BEGIN SELECT RAISE(ABORT, 'injected assignment failure'); END`);
  await expect(
    initializeCustomerPermissions(authorization, database),
  ).rejects.toThrow('injected assignment failure');
  expect(await authorization.permissionSets.get(key)).toBeUndefined();
  expect(await authorization.permissionSets.listAssignments(key)).toEqual([]);
  await client.raw('DROP TRIGGER fail_audit_membership');
  const restarted = createAppAuthorization({
    connection: otherDatabase.connection(),
  });
  await initializeCustomerPermissions(restarted, otherDatabase);
  expect(await restarted.permissionSets.get(key)).toBeDefined();
  expect(await restarted.permissionSets.listAssignments(key)).toHaveLength(1);
});

it('preserves administrative grant edits and membership revocation across restarts', async () => {
  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  await initializeCustomerPermissions(authorization, database);
  await authorization.permissionSets.update(key, {
    key,
    title: 'Restricted by administrator',
    grants: [],
  });
  const [assignment] = await authorization.permissionSets.listAssignments(key);
  await authorization.permissionSets.revoke(assignment!.id);
  const restarted = createAppAuthorization({
    connection: otherDatabase.connection(),
  });
  await initializeCustomerPermissions(restarted, otherDatabase);
  expect(await restarted.permissionSets.get(key)).toMatchObject({
    title: 'Restricted by administrator',
    grants: [],
  });
  expect(await restarted.permissionSets.listAssignments(key)).toEqual([]);
});
