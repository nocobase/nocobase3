import sqlite from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permissions';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAppAuthorization } from '../server/authorization.js';

describe('the subjects an application counts as able to act', () => {
  let database: DatabaseManager;
  let authorization: ReturnType<typeof createAppAuthorization>;

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
    authorization = createAppAuthorization({
      connection: database.connection(),
    });
    // What the provider declares at runtime.
    authorization.permissionSets.protect({
      owner: '@nocobase/app-plugin-authorization',
      keys: ['system-administrator'],
      allow: ['assign', 'revoke'],
      requireActiveAssignment: true,
    });
    await authorization.permissionSets.create({
      key: 'system-administrator',
      title: 'System administrator',
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
      permissionSet: 'system-administrator',
    });

    await expect(
      authorization.permissionSets.revoke('user:root:system-administrator'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
  });

  it('does not count a disabled account as a superuser who can act', async () => {
    await createUser(database, 'root');
    await createUser(database, 'retired', { disabled: true });
    for (const id of ['root', 'retired']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id },
        permissionSet: 'system-administrator',
      });
    }

    // Two assignments exist, but only one of them belongs to an account that
    // can still sign in.
    await expect(
      authorization.permissionSets.revoke('user:root:system-administrator'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
    await expect(
      authorization.permissionSets.revoke('user:retired:system-administrator'),
    ).resolves.toBeUndefined();
  });

  it('counts a second enabled superuser and allows the revocation', async () => {
    await createUser(database, 'root');
    await createUser(database, 'second');
    for (const id of ['root', 'second']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id },
        permissionSet: 'system-administrator',
      });
    }

    await expect(
      authorization.permissionSets.revoke('user:root:system-administrator'),
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
