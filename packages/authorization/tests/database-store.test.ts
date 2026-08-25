import {
  createDatabaseManager,
  type DatabaseConnection,
} from '@nocobase/app-database';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Authorization, DatabaseAuthorizationStore } from '../src/index.js';
import { createAssignmentCollection } from '../src/storage/collections/assignment.js';
import { createAuditLogCollection } from '../src/storage/collections/audit-log.js';
import { createObjectPermissionCollection } from '../src/storage/collections/object-permission.js';
import { createOrganizationWideDefaultCollection } from '../src/storage/collections/organization-wide-default.js';
import { createPermissionSetCollection } from '../src/storage/collections/permission-set.js';
import { createPermissionSetGroupCollection } from '../src/storage/collections/permission-set-group.js';
import { createPermissionSetGroupItemCollection } from '../src/storage/collections/permission-set-group-item.js';
import { createRestrictionRuleCollection } from '../src/storage/collections/restriction-rule.js';
import { createSharingRuleCollection } from '../src/storage/collections/sharing-rule.js';
import { createSharingRuleRecordCollection } from '../src/storage/collections/sharing-rule-record.js';

async function createCollections(connection: DatabaseConnection) {
  const { builder } = connection;
  await createPermissionSetCollection(builder);
  await createPermissionSetGroupCollection(builder);
  await createPermissionSetGroupItemCollection(builder);
  await createObjectPermissionCollection(builder);
  await createAssignmentCollection(builder);
  await createOrganizationWideDefaultCollection(builder);
  await createSharingRuleCollection(builder);
  await createSharingRuleRecordCollection(builder);
  await createRestrictionRuleCollection(builder);
  await createAuditLogCollection(builder);
}

describe('DatabaseAuthorizationStore', () => {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
      },
    },
  });

  beforeAll(async () => {
    const connection = database.connection();
    await createCollections(connection);
    const now = new Date('2026-08-18T00:00:00Z');
    await connection.query
      .insertInto('authzPermissionSets')
      .values({
        id: 'ps1',
        key: 'order-reader',
        title: 'Order reader',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('authzObjectPermissions')
      .values({
        id: 'op1',
        permissionSetId: 'ps1',
        resource: 'orders',
        actions: JSON.stringify([
          {
            action: 'read',
            outputFields: ['id', 'name', 'ownerId'],
            recordScope: [{ policy: 'recordsIOwn' }],
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('authzAssignments')
      .values({
        id: 'a1',
        subjectType: 'user',
        subjectId: 'alice',
        targetType: 'permissionSet',
        targetId: 'ps1',
        startsAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('authzOrganizationWideDefaults')
      .values({
        id: 'owd1',
        resource: 'orders',
        access: 'private',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('authzSharingRules')
      .values({
        id: 'share1',
        key: 'share-order-1',
        title: 'Share order 1',
        resource: 'orders',
        actions: JSON.stringify(['read']),
        subjects: JSON.stringify([{ type: 'user', id: 'alice' }]),
        recordType: 'records',
        scopes: null,
        startsAt: null,
        expiresAt: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('authzSharingRuleRecords')
      .values({
        id: 'share-record1',
        sharingRuleId: 'share1',
        recordId: 'order-1',
        createdAt: now,
      })
      .execute();
  });

  afterAll(async () => database.destroy());

  it('loads authorization data through the Database Query API', async () => {
    const authorization = new Authorization({
      store: new DatabaseAuthorizationStore(database.connection()),
    });
    authorization.resources.register({
      name: 'orders',
      actions: ['read'],
      fields: {
        id: { type: 'scalar' },
        name: { type: 'scalar' },
        ownerId: { type: 'scalar' },
      },
      attributes: { owner: 'ownerId' },
    });
    const plan = await authorization.plan(
      { id: 'alice' },
      { resource: 'orders', action: 'read' },
    );
    expect(plan.allowed).toBe(true);
    expect(plan.filter?.root.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['ownerId'], value: 'alice' }),
      ]),
    );
  });

  it('loads explicit record shares from the normalized child collection', async () => {
    const authorization = new Authorization({
      store: new DatabaseAuthorizationStore(database.connection()),
    });
    authorization.resources.register({
      name: 'orders',
      actions: ['read'],
      fields: {
        id: { type: 'scalar' },
        name: { type: 'scalar' },
        ownerId: { type: 'scalar' },
      },
      attributes: { owner: 'ownerId', identifier: 'id' },
    });
    const plan = await authorization.plan(
      { id: 'alice' },
      { resource: 'orders', action: 'read' },
    );
    expect(plan.filter?.root.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'membership',
          path: ['id'],
          source: {
            collection: 'authzSharingRuleRecords',
            field: 'recordId',
            where: { sharingRuleId: 'share1' },
          },
        }),
      ]),
    );
    expect(JSON.stringify(plan.filter)).not.toContain('"$in"');

    await expect(
      authorization.can(
        { id: 'alice' },
        {
          resource: 'orders',
          action: 'read',
          record: { id: 'order-1', ownerId: 'bob' },
        },
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.can(
        { id: 'alice' },
        {
          resource: 'orders',
          action: 'read',
          record: { id: 'order-2', ownerId: 'bob' },
        },
      ),
    ).resolves.toBe(false);
  });

  it('creates application relations without physical foreign keys', async () => {
    const knex = await database.connection().client<Knex>();
    for (const table of [
      'authz_object_permissions',
      'authz_permission_set_group_items',
      'authz_sharing_rule_records',
    ]) {
      expect(await knex.raw(`PRAGMA foreign_key_list(${table})`)).toEqual([]);
    }
  });
});

describe('Authorization collection naming', () => {
  it('supports underscored: false', async () => {
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
    try {
      const connection = database.connection();
      await createCollections(connection);
      await connection.query
        .insertInto('authzPermissionSets')
        .values({
          id: 'ps1',
          key: 'reader',
          title: 'Reader',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
      await expect(
        connection.query
          .selectFrom('authzPermissionSets')
          .select('key')
          .executeTakeFirst(),
      ).resolves.toEqual({ key: 'reader' });
    } finally {
      await database.destroy();
    }
  });
});
