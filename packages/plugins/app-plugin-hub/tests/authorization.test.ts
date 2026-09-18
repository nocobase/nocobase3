import { fileURLToPath } from 'node:url';

import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createHubUserRoleScope,
  HUB_ADMINISTRATOR,
} from '../server/authorization.js';

describe('Hub user role scope', () => {
  let database: DatabaseManager;
  let authorization: ReturnType<typeof createAppAuthorization>;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
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

  it('leaves ownership and existing Apps unchanged when migrations run again', async () => {
    await database
      .query()
      .insertInto('hubApps')
      .values({
        id: 'owned',
        name: 'Owned',
        createdBy: 'user-1',
        enabled: false,
        basePath: '/owned',
        backend: 'in-process',
        startupMode: 'lazy',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    const directory = '../database/migrations';
    const migrator = createMigrator({
      database,
      packageName: '@nocobase/app-plugin-hub',
      directory: fileURLToPath(new URL(directory, import.meta.url)),
    });
    expect((await migrator.latest()).executed).toEqual([]);
    expect((await migrator.latest()).executed).toEqual([]);
    expect(
      await database
        .query()
        .selectFrom('hubApps')
        .select(['id', 'createdBy'])
        .execute(),
    ).toEqual([{ id: 'owned', createdBy: 'user-1' }]);
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

  it('exposes localized labels for the Hub role scope and options', async () => {
    const scope = createHubUserRoleScope(authorization);

    await expect(scope.options()).resolves.toEqual([
      expect.objectContaining({
        value: 'hub-administrator',
        labelI18nKey: 'roles.names.hub-administrator',
        labelI18nNs: '@nocobase/app-plugin-hub',
      }),
      expect.objectContaining({
        value: 'hub-operator',
        labelI18nKey: 'roles.names.hub-operator',
        labelI18nNs: '@nocobase/app-plugin-hub',
      }),
      expect.objectContaining({
        value: 'hub-viewer',
        assignable: false,
        labelI18nKey: 'roles.names.hub-viewer',
        labelI18nNs: '@nocobase/app-plugin-hub',
      }),
    ]);
    expect(scope).toMatchObject({
      labelI18nKey: 'roles.scope',
      labelI18nNs: '@nocobase/app-plugin-hub',
    });
  });

  it('preserves existing Viewers without allowing new assignments or automatic promotion', async () => {
    await createUser(database, 'legacy');
    await createUser(database, 'new-user');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'legacy' },
      permissionSet: 'hub-viewer',
    });
    const scope = createHubUserRoleScope(authorization);
    expect(
      (await scope.options())
        .filter((option) => option.assignable !== false)
        .map((option) => option.value),
    ).toEqual(['hub-administrator', 'hub-operator']);
    const before = await authorization.permissionSets.listAssignments();
    await expect(
      database.transaction((connection) =>
        scope.replace('new-user', 'hub-viewer', connection),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ROLE_SCOPE_VALUE' });
    await database.transaction((connection) =>
      scope.replace('legacy', 'hub-viewer', connection),
    );
    expect(await authorization.permissionSets.listAssignments()).toEqual(
      before,
    );
    expect(await scope.get('legacy', database.connection())).toBe('hub-viewer');
    expect(await scope.getMany?.(['legacy'], database.connection())).toEqual({
      legacy: 'hub-viewer',
    });
    expect(
      await scope.findUserIds?.('hub-viewer', database.connection()),
    ).toEqual(['legacy']);
    await database.transaction((connection) =>
      scope.replace('legacy', 'hub-operator', connection),
    );
    expect(await scope.get('legacy', database.connection())).toBe(
      'hub-operator',
    );
    await expect(
      database.transaction((connection) =>
        scope.replace('legacy', 'hub-viewer', connection),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ROLE_SCOPE_VALUE' });
  });

  it('loads one page of Hub roles through one batch read', async () => {
    await createUser(database, 'user-1');
    await createUser(database, 'user-2');
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'user-1' },
      permissionSet: 'hub-operator',
    });
    const listAssignments = vi.spyOn(
      authorization.permissionSets,
      'listAssignments',
    );
    vi.spyOn(authorization.permissionSets, 'withConnection').mockReturnValue(
      authorization.permissionSets,
    );
    const scope = createHubUserRoleScope(authorization);

    await expect(
      scope.getMany?.(['user-1', 'user-2'], database.connection()),
    ).resolves.toEqual({
      'user-1': 'hub-operator',
      'user-2': '',
    });
    expect(listAssignments).toHaveBeenCalledTimes(1);
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
        scope.replace('admin-1', 'hub-operator', connection),
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
      scope.replace('admin-1', 'hub-operator', connection),
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
        scope.replace('admin-1', 'hub-operator', connection),
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
