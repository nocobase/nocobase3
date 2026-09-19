import { createAuthorization } from './authorization-fixture.js';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import permissionSetMigration from '../database/migrations/202608210001_create_permission_set_tables.js';
import defaultAccessMigration from '../../app-plugin-authz-default-access/database/migrations/202608210002_create_default_access_rules.js';
import sharingRulesMigration from '../../app-plugin-authz-sharing-rules/database/migrations/202608210003_create_sharing_rules.js';
import restrictionRulesMigration from '../../app-plugin-authz-restriction-rules/database/migrations/202608210004_create_restriction_rules.js';
import {
  permissionSets,
  PermissionSetLastAssignmentError,
} from '@nocobase/authorization/permissions';
import { databaseAuthorization } from '../server/database/index.js';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { DatabasePermissionSetStore } from '../server/stores/permission-sets.js';

describe('authorization plugin database stores', () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });

  beforeAll(async () => {
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await permissionSetMigration.up(context);
    await defaultAccessMigration.up(context);
    await sharingRulesMigration.up(context);
    await restrictionRulesMigration.up(context);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it.each(['revoke', 'replace', 'mixed'] as const)(
    'retains the last administrator during concurrent %s operations',
    async (operation) => {
      const key = `concurrent-${operation}`;
      const authorization = createAuthorization({
        plugins: [
          permissionSets({
            store: new DatabasePermissionSetStore(() => database.connection()),
            rootSet: key,
          }),
        ],
      });
      await authorization.permissionSets.create({ key, grants: [] });
      for (const id of ['alice', 'bob']) {
        await authorization.permissionSets.assign({
          id: `${key}-${id}`,
          subject: { type: 'user', id },
          permissionSet: key,
        });
      }
      const notifications: string[] = [];
      authorization.permissionSets.onChange(async (subject) => {
        // An independent connection read can complete only after the writer
        // commits and releases SQLite's single pooled connection.
        expect(
          await authorization.permissionSets.listAssignments(key),
        ).toHaveLength(1);
        notifications.push(subject.id);
      });
      const results = await Promise.allSettled(
        ['alice', 'bob'].map((id, index) =>
          operation === 'revoke' || (operation === 'mixed' && index === 0)
            ? authorization.permissionSets.revoke(`${key}-${id}`)
            : authorization.permissionSets.replaceSubjectAssignments({
                subject: { type: 'user', id },
                managedPermissionSets: [key],
                permissionSets: [],
              }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({
        reason: expect.any(PermissionSetLastAssignmentError),
      });
      expect(
        await authorization.permissionSets.listAssignments(key),
      ).toHaveLength(1);
      expect(notifications).toHaveLength(1);
      await database.connection().transaction(async (connection) => {
        await authorization.permissionSets
          .withTransaction(connection)
          .delete(key);
      });
    },
  );

  it('rolls back an assignment replacement and emits no change on failure', async () => {
    const key = 'rollback-assignment';
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
      ],
    });
    await authorization.permissionSets.create({ key, grants: [] });
    await authorization.permissionSets.create({
      key: `${key}-other`,
      grants: [],
    });
    await authorization.permissionSets.assign({
      id: key,
      subject: { type: 'user', id: 'alice' },
      permissionSet: key,
    });
    // Collide with the generated assignment id after the old row was deleted.
    await authorization.permissionSets.assign({
      id: `user:alice:${key}-other`,
      subject: { type: 'user', id: 'bob' },
      permissionSet: `${key}-other`,
    });
    const notifications: string[] = [];
    authorization.permissionSets.onChange((subject) => {
      notifications.push(subject.id);
    });
    await expect(
      authorization.permissionSets.replaceSubjectAssignments({
        subject: { type: 'user', id: 'alice' },
        managedPermissionSets: [key, `${key}-other`],
        permissionSets: [`${key}-other`],
      }),
    ).rejects.toThrow();
    expect(
      await authorization.permissionSets.listAssignments(key),
    ).toHaveLength(1);
    expect(notifications).toEqual([]);
    await authorization.permissionSets.delete(key);
    await authorization.permissionSets.delete(`${key}-other`);
  });

  it('leaves commit and notification ownership with the caller of withTransaction', async () => {
    const key = 'outer-transaction';
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
      ],
    });
    await authorization.permissionSets.create({ key, grants: [] });
    await authorization.permissionSets.assign({
      id: key,
      subject: { type: 'user', id: key },
      permissionSet: key,
    });
    const notifications: string[] = [];
    authorization.permissionSets.onChange((subject) => {
      notifications.push(subject.id);
    });
    await expect(
      database.connection().transaction(async (connection) => {
        const api = authorization.permissionSets.withTransaction(connection);
        await api.revoke(key);
        expect(await api.listAssignments(key)).toEqual([]);
        throw new Error('outer rollback');
      }),
    ).rejects.toThrow('outer rollback');
    expect(
      await authorization.permissionSets.listAssignments(key),
    ).toHaveLength(1);
    expect(notifications).toEqual([]);
    await authorization.permissionSets.delete(key);
  });

  it('persists Permission Sets independently from database access rules', async () => {
    const databasePlugin = databaseAuthorization();
    const connection = database.connection();
    const authorization = createAuthorization({
      connection,
      plugins: [
        permissionSets({
          store: new DatabasePermissionSetStore(() => connection),
        }),
        databasePlugin,
      ],
    });

    await authorization.permissionSets.create({
      key: 'order-reader',
      grants: [
        authorization.db.grant('orders', {
          read: { fields: ['id', 'amount'] },
        }),
      ],
    });
    await authorization.permissionSets.assign({
      id: 'assignment-1',
      subject: { type: 'user', id: 'alice' },
      permissionSet: 'order-reader',
    });

    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
      }),
    ).resolves.toMatchObject([
      {
        key: 'order-reader',
        grants: [
          {
            resource: {
              type: 'database.collection',
              id: 'orders',
            },
          },
        ],
      },
    ]);

    await authorization.permissionSets.update('order-reader', {
      key: 'order-viewer',
      grants: [],
    });
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
      }),
    ).resolves.toMatchObject([{ key: 'order-viewer' }]);

    await authorization.permissionSets.delete('order-viewer');
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
      }),
    ).resolves.toEqual([]);
  });

  it('persists generic default, sharing, and restriction rules independently', async () => {
    const authorization = createAuthorization({
      connection: database.connection(),
      plugins: [
        permissionSets({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
        defaultAccess(),
        sharingRules(),
        restrictionRules(),
      ],
    });
    const resource = { type: 'database.collection', id: 'orders' };

    await authorization.defaultAccess.set({
      resource,
      actions: [{ action: 'read', scope: { type: 'all' } }],
    });
    await authorization.sharingRules.create({
      key: 'shared-orders',
      resource,
      actions: [
        {
          action: 'read',
          selection: { type: 'records', ids: ['order-1'] },
        },
      ],
      subjects: [{ type: 'user', id: 'alice' }],
    });
    await authorization.restrictionRules.create({
      key: 'owned-orders-only',
      resource,
      actions: [
        {
          action: 'read',
          scope: {
            type: 'database',
            recordAccess: 'recordsIOwn',
          },
        },
      ],
      subjects: [{ type: 'user', id: 'alice' }],
    });

    await expect(
      authorization.defaultAccess.get(resource.type, resource.id),
    ).resolves.toMatchObject({
      actions: [{ action: 'read', scope: { type: 'all' } }],
    });
    await expect(authorization.sharingRules.list()).resolves.toMatchObject([
      {
        key: 'shared-orders',
        actions: [
          {
            action: 'read',
            selection: { type: 'records', ids: ['order-1'] },
          },
        ],
      },
    ]);
    await expect(authorization.restrictionRules.list()).resolves.toMatchObject([
      { key: 'owned-orders-only' },
    ]);
  });
  it('round-trips independent record IDs for two scopes of the same operation', async () => {
    const authorization = createAuthorization({
      connection: database.connection(),
      plugins: [
        permissionSets({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
        defaultAccess(),
        sharingRules(),
        restrictionRules(),
      ],
    });
    const resource = { type: 'resource', id: 'sales.submit' };
    const actions = [
      {
        action: 'submit',
        scopeKey: 'projects',
        scope: { type: 'ids', ids: ['shared-id', 'project-2'] },
      },
      {
        action: 'submit',
        scopeKey: 'quotes',
        scope: { type: 'ids', ids: ['shared-id', 'quote-2'] },
      },
    ];
    await authorization.defaultAccess.set({ resource, actions });
    await authorization.restrictionRules.create({
      key: 'scoped-restrictions',
      resource,
      actions,
      subjects: [],
    });
    const sharingActions = actions.map(({ action, scopeKey, scope }) => ({
      action,
      scopeKey,
      selection: { type: 'records' as const, ids: scope.ids },
    }));
    await authorization.sharingRules.create({
      key: 'scoped-sharing',
      resource,
      actions: sharingActions,
      subjects: [],
    });
    await expect(
      authorization.defaultAccess.get(resource.type, resource.id),
    ).resolves.toMatchObject({ actions });
    await expect(
      authorization.restrictionRules.get('scoped-restrictions'),
    ).resolves.toMatchObject({ actions });
    await expect(
      authorization.sharingRules.get('scoped-sharing'),
    ).resolves.toMatchObject({ actions: sharingActions });
    await authorization.defaultAccess.delete(resource.type, resource.id);
    await authorization.restrictionRules.delete('scoped-restrictions');
    await authorization.sharingRules.delete('scoped-sharing');
    await expect(
      authorization.defaultAccess.get(resource.type, resource.id),
    ).resolves.toBeUndefined();
    await expect(
      authorization.restrictionRules.get('scoped-restrictions'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.sharingRules.get('scoped-sharing'),
    ).resolves.toBeUndefined();
  });
});
