import sqlite from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  createMigrator,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permissions';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAppAuthorization } from '../server/authorization.js';
import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionSetsAuthorizationApi } from '@nocobase/authorization/permissions';

type AppAuthorizationWithPermissionSets = Authorization &
  PermissionSetsAuthorizationApi;

function appAuthorization(
  connection: DatabaseConnection,
): AppAuthorizationWithPermissionSets {
  // `rootSet` is what declares the root set may never lose its last
  // assignment that can still act, which is what these tests drive.
  return createAppAuthorization({
    connection,
    config: { permissionSets: { rootSet: 'root' } },
  });
}

/**
 * The application decides which subjects can still act by declaring a subject
 * type; this stands in for the one `@nocobase/app-plugin-users` declares.
 */
function defineEnabledUsers(
  authorization: Authorization,
  database: DatabaseManager,
): void {
  authorization.subjects.define('user', {
    filterActive: async (ids, connection) => {
      const rows = await (connection ?? database.connection()).query
        .selectFrom('user')
        .select(['id'])
        .where('id', 'in', [...ids])
        .where('disabledAt', 'is', null)
        .execute();
      return rows.map((row) => String(row.id));
    },
  });
}

describe('the subjects an application counts as able to act', () => {
  let database: DatabaseManager;
  let authorization: AppAuthorizationWithPermissionSets;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await migratePackage(
      database,
      '@nocobase/app-plugin-authentication',
      '../../app-plugin-authentication/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-authorization',
      '../database/migrations',
    );
    authorization = appAuthorization(database.connection());
    await authorization.permissionSets.create({
      key: 'root',
      title: 'Root',
      grants: [],
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('refuses to revoke the seeded superuser while it is the only one', async () => {
    await createUser(database, 'root');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'root' },
      permissionSet: 'root',
    });

    await expect(
      authorization.permissionSets.revoke('user:root:root'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
  });

  it('does not count a disabled account as a superuser who can act', async () => {
    defineEnabledUsers(authorization, database);
    await createUser(database, 'root');
    await createUser(database, 'retired', { disabled: true });
    for (const id of ['root', 'retired']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id },
        permissionSet: 'root',
      });
    }

    // Two assignments exist, but only one of them belongs to an account that
    // can still sign in.
    await expect(
      authorization.permissionSets.revoke('user:root:root'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
    await expect(
      authorization.permissionSets.revoke('user:retired:root'),
    ).resolves.toBeUndefined();
  });

  it('counts a second enabled superuser and allows the revocation', async () => {
    await createUser(database, 'root');
    await createUser(database, 'second');
    for (const id of ['root', 'second']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id },
        permissionSet: 'root',
      });
    }

    await expect(
      authorization.permissionSets.revoke('user:root:root'),
    ).resolves.toBeUndefined();
  });
});

async function migratePackage(
  database: DatabaseManager,
  packageName: string,
  directory: string,
): Promise<void> {
  await createMigrator({
    database,
    packageName,
    directory: fileURLToPath(new URL(directory, import.meta.url)),
  }).latest();
}

async function createUser(
  database: DatabaseManager,
  id: string,
  options: { disabled?: boolean } = {},
): Promise<void> {
  const now = new Date();
  await database
    .connection()
    .query.insertInto('user')
    .values({
      id,
      name: id,
      username: id,
      email: `${id}@example.com`,
      emailVerified: true,
      disabledAt: options.disabled ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
