import { fileURLToPath } from 'node:url';

import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApplicationUserRoleScope } from '../../server/providers/user-roles.js';

describe('default application user role scope', () => {
  let database: DatabaseManager;
  let authorization: ReturnType<typeof createAppAuthorization>;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    await migratePackage(
      database,
      '@nocobase/app-plugin-authentication',
      '../../../../plugins/app-plugin-authentication/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-authorization',
      '../../../../plugins/app-plugin-authorization/database/migrations',
    );
    authorization = createAppAuthorization({
      connection: database.connection(),
    });
    await authorization.permissionSets.create({
      key: 'system-administrator',
      title: 'System administrator',
      grants: [],
    });
    await authorization.permissionSets.create({
      key: 'content-editor',
      title: 'Content editor',
      grants: [],
    });
    await authorization.permissionSets.create({
      key: 'plugin-internal',
      title: 'Plugin internal',
      grants: [],
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('shows direct application roles but not authenticated defaults or other protected sets', async () => {
    const scope = createApplicationUserRoleScope(authorization, protection());

    await expect(scope.options()).resolves.toEqual([
      {
        value: 'content-editor',
        label: 'Content editor',
      },
      {
        value: 'system-administrator',
        label: 'System administrator',
        labelI18nKey: 'page.systemAdministrator',
        labelI18nNs: '@nocobase/app-plugin-users',
        assignable: false,
        removable: false,
      },
    ]);
    expect(scope).toMatchObject({
      key: 'app',
      labelI18nKey: 'page.roles',
      labelI18nNs: '@nocobase/app-plugin-users',
      selection: 'multiple',
      hasAuthenticatedDefaultAccess: true,
    });
  });

  it('replaces custom roles while preserving authenticated defaults', async () => {
    await createUser(database, 'user-1');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'user-1' },
      permissionSet: 'default-pages',
    });
    const scope = createApplicationUserRoleScope(authorization, protection());

    await database.transaction((connection) =>
      scope.replace('user-1', ['content-editor'], connection),
    );

    await expect(scope.get('user-1', database.connection())).resolves.toEqual([
      'content-editor',
    ]);
    await expect(
      scope.findUserIds('content-editor', database.connection()),
    ).resolves.toEqual(['user-1']);
    expect(
      (await authorization.permissionSets.listAssignments())
        .filter(({ subject }) => subject.id === 'user-1')
        .map(({ permissionSet }) => permissionSet)
        .sort(),
    ).toEqual(['content-editor', 'default-pages']);
  });

  it('rejects changes to the protected system administrator assignment', async () => {
    await createUser(database, 'admin-1');
    await createUser(database, 'user-1');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'admin-1' },
      permissionSet: 'system-administrator',
    });
    const scope = createApplicationUserRoleScope(authorization, protection());

    await expect(
      database.transaction((connection) =>
        scope.replace('admin-1', [], connection),
      ),
    ).rejects.toMatchObject({ code: 'PROTECTED_ROLE_ASSIGNMENT', status: 409 });
    await expect(
      database.transaction((connection) =>
        scope.replace('user-1', ['system-administrator'], connection),
      ),
    ).rejects.toMatchObject({ code: 'PROTECTED_ROLE_ASSIGNMENT', status: 409 });
  });
});

function protection() {
  return {
    isProtected: (key: string) =>
      key === 'system-administrator' || key === 'plugin-internal',
  };
}

async function migratePackage(
  database: DatabaseManager,
  packageName: string,
  directory: string,
) {
  await createMigrator({
    database,
    packageName,
    directory: fileURLToPath(new URL(directory, import.meta.url)),
  }).latest();
}

async function createUser(database: DatabaseManager, id: string) {
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
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
