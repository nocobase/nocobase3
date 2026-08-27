import { createDatabaseManager } from '@nocobase/app-database';
import { createAssignmentCollection } from '@nocobase/authorization/storage/collections/assignment';
import { createObjectPermissionCollection } from '@nocobase/authorization/storage/collections/object-permission';
import { createPermissionSetCollection } from '@nocobase/authorization/storage/collections/permission-set';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppAccessControlDefinition } from '../types.js';
import { createAppAccessControlBridgeMigration } from '../server/migration.js';

const definition: AppAccessControlDefinition = {
  appKey: 'test-app',
  appName: 'Test App',
  adminRoleKey: 'test-admin',
  roles: [
    {
      key: 'test-admin',
      title: 'Administrator',
      description: 'Administrates the test App.',
      system: true,
      permissions: [
        {
          resource: 'records',
          capabilities: ['read', 'create', 'update', 'destroy'],
        },
      ],
    },
    {
      key: 'test-member',
      title: 'Member',
      description: 'Works with owned records.',
      permissions: [
        {
          resource: 'records',
          capabilities: ['read', 'update'],
          scope: 'own',
        },
      ],
    },
  ],
  resources: [{ name: 'records', title: 'Records', supportsOwnScope: true }],
};

describe('App access-control authorization migration', () => {
  const databases: ReturnType<typeof createDatabaseManager>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map((database) => database.destroy()),
    );
  });

  it('bridges legacy roles and assignments without deleting old data', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: { underscored: false },
        },
      },
    });
    databases.push(database);
    const connection = database.connection();
    await createPermissionSetCollection(connection.builder);
    await createObjectPermissionCollection(connection.builder);
    await createAssignmentCollection(connection.builder);
    const knex = await connection.client<Knex>();
    const now = new Date();
    await knex('authzPermissionSets').insert({
      id: 'legacy-member-role',
      key: 'test-member',
      title: 'Legacy member',
      description: 'Legacy role',
      createdAt: now,
      updatedAt: now,
    });
    await knex('authzObjectPermissions').insert({
      id: 'legacy-record-permission',
      permissionSetId: 'legacy-member-role',
      resource: 'records',
      actions: JSON.stringify([
        {
          action: 'list',
          inputFields: '*',
          outputFields: '*',
          recordScope: [{ policy: 'recordsIOwn' }],
        },
      ]),
      createdAt: now,
      updatedAt: now,
    });
    await knex('authzAssignments').insert({
      id: 'legacy-member-assignment',
      subjectType: 'user',
      subjectId: 'user-1',
      targetType: 'permissionSet',
      targetId: 'legacy-member-role',
      startsAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const migration = createAppAccessControlBridgeMigration(
      '202608260001_migrate_authorization_core',
      definition,
    );
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await migration.up(context);
    await migration.up(context);

    await expect(
      knex('authorizationPermissionSets')
        .whereIn('key', ['test-admin', 'test-member'])
        .orderBy('key')
        .select(['key', 'title']),
    ).resolves.toEqual([
      { key: 'test-admin', title: 'Administrator' },
      { key: 'test-member', title: 'Legacy member' },
    ]);
    const member = await knex('authorizationPermissionSets')
      .where({ key: 'test-member' })
      .select('grants')
      .first();
    expect(JSON.parse(String(member?.grants))).toEqual([
      expect.objectContaining({
        resource: { type: 'database.collection', id: 'main.records' },
        actions: [
          expect.objectContaining({
            action: 'list',
            policy: expect.objectContaining({
              recordAccess: ['recordsIOwn'],
            }),
          }),
        ],
      }),
    ]);
    await expect(
      knex('authorizationPermissionSetAssignments').select([
        'subjectType',
        'subjectId',
        'permissionSetKey',
      ]),
    ).resolves.toEqual([
      {
        subjectType: 'user',
        subjectId: 'user-1',
        permissionSetKey: 'test-member',
      },
    ]);
    await expect(
      knex('authzPermissionSets').count({ count: '*' }),
    ).resolves.toEqual([{ count: 1 }]);
    expect(await knex.schema.hasTable('appAccessControlAuditLogs')).toBe(true);
  });
});
