import { fileURLToPath } from 'node:url';

import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createHubUserRoleScope,
  HUB_ADMINISTRATOR,
} from '../server/authorization.js';

describe('Hub user role scope', () => {
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
      '../../app-plugin-authentication/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-authorization',
      '../../app-plugin-authorization/database/migrations',
    );
    await migratePackage(
      database,
      '@nocobase/app-plugin-hub',
      '../database/migrations',
    );
    authorization = createAppAuthorization({
      connection: database.connection(),
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('keeps exactly one Hub role without touching other Permission Sets', async () => {
    await createUser(database, 'user-1');
    await authorization.permissionSets.create({
      key: 'other-role',
      grants: [],
    });
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'user-1' },
      permissionSet: 'hub-viewer',
    });
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'user-1' },
      permissionSet: 'other-role',
    });
    const scope = createHubUserRoleScope(authorization);

    await database.transaction((connection) =>
      scope.replace('user-1', 'hub-operator', connection),
    );

    const assignments = await authorization.permissionSets.listAssignments();
    expect(
      assignments
        .filter(({ subject }) => subject.id === 'user-1')
        .map(({ permissionSet }) => permissionSet)
        .sort(),
    ).toEqual(['hub-operator', 'other-role']);
    await expect(
      database.transaction((connection) =>
        scope.replace('user-1', 'unknown-role', connection),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ROLE_SCOPE_VALUE' });
    await expect(
      database.transaction((connection) =>
        scope.replace('user-1', ['hub-viewer', 'hub-operator'], connection),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ROLE_SCOPE_VALUE' });
  });

  it('protects the last enabled Hub administrator', async () => {
    await createUser(database, 'admin-1');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'admin-1' },
      permissionSet: HUB_ADMINISTRATOR,
    });
    const scope = createHubUserRoleScope(authorization);

    await expect(
      database.transaction((connection) =>
        scope.assertCanDisable!('admin-1', connection),
      ),
    ).rejects.toMatchObject({ code: 'LAST_HUB_ADMIN', status: 409 });
    await expect(
      database.transaction((connection) =>
        scope.replace('admin-1', 'hub-viewer', connection),
      ),
    ).rejects.toMatchObject({ code: 'LAST_HUB_ADMIN', status: 409 });
  });

  it('allows one administrator to be disabled or demoted when another is enabled', async () => {
    await createUser(database, 'admin-1');
    await createUser(database, 'admin-2');
    for (const userId of ['admin-1', 'admin-2']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet: HUB_ADMINISTRATOR,
      });
    }
    const scope = createHubUserRoleScope(authorization);

    await expect(
      database.transaction((connection) =>
        scope.assertCanDisable!('admin-1', connection),
      ),
    ).resolves.toBeUndefined();
    await database.transaction((connection) =>
      scope.replace('admin-1', 'hub-viewer', connection),
    );
    await expect(
      database.transaction((connection) =>
        scope.assertCanDisable!('admin-2', connection),
      ),
    ).rejects.toMatchObject({ code: 'LAST_HUB_ADMIN' });
  });

  it('keeps one enabled administrator when demotion and disable compete', async () => {
    await createUser(database, 'admin-1');
    await createUser(database, 'admin-2');
    for (const userId of ['admin-1', 'admin-2']) {
      await authorization.permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet: HUB_ADMINISTRATOR,
      });
    }
    const scope = createHubUserRoleScope(authorization);

    const results = await Promise.allSettled([
      database.transaction((connection) =>
        scope.replace('admin-1', 'hub-viewer', connection),
      ),
      database.transaction(async (connection) => {
        await scope.assertCanDisable!('admin-2', connection);
        await connection.query
          .updateTable('user')
          .set({ disabledAt: new Date() })
          .where('id', '=', 'admin-2')
          .execute();
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({ code: 'LAST_HUB_ADMIN' });
    const enabledAdministrators = await database
      .connection()
      .query.selectFrom('authorizationPermissionSetAssignments')
      .innerJoin(
        'user',
        'user.id',
        'authorizationPermissionSetAssignments.subjectId',
      )
      .select('authorizationPermissionSetAssignments.subjectId')
      .where('authorizationPermissionSetAssignments.subjectType', '=', 'user')
      .where(
        'authorizationPermissionSetAssignments.permissionSetKey',
        '=',
        HUB_ADMINISTRATOR,
      )
      .where('user.disabledAt', 'is', null)
      .execute();
    expect(enabledAdministrators).toHaveLength(1);
  });
});

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
