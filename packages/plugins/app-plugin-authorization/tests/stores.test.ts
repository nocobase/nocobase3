import { createAuthorization } from './authorization-fixture.js';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import permissionSetMigration from '../database/migrations/202608210001_create_permission_set_tables.js';
import defaultAccessMigration from '../../app-plugin-authz-default-access/database/migrations/202608210002_create_default_access_rules.js';
import sharingRulesMigration from '../../app-plugin-authz-sharing-rules/database/migrations/202608210003_create_sharing_rules.js';
import restrictionRulesMigration from '../../app-plugin-authz-restriction-rules/database/migrations/202608210004_create_restriction_rules.js';
import { permissionSets } from '@nocobase/authorization/permissions';
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
