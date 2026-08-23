import { createDatabaseManager } from '@nocobase/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import permissionSetMigration from '../src/plugins/permission-sets/migrations/202608210001_create_permission_set_tables.js';
import defaultAccessMigration from '../src/plugins/default-access/migrations/202608210002_create_default_access_rules.js';
import sharingRulesMigration from '../src/plugins/sharing-rules/migrations/202608210003_create_sharing_rules.js';
import restrictionRulesMigration from '../src/plugins/restriction-rules/migrations/202608210004_create_restriction_rules.js';
import {
  createAuthorization,
  databaseAuthorization,
  defaultAccess,
  permissionSets,
  restrictionRules,
  sharingRules,
} from '../src/index.js';

describe('authorization plugin database stores', () => {
  const database = createDatabaseManager({
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
    const authorization = createAuthorization({
      connection: database.connection(),
      plugins: [permissionSets(), databasePlugin],
    });

    await authorization.permissionSets.create({
      key: 'order-reader',
      grants: [
        authorization.database.grant('orders', {
          read: { fields: { output: ['id', 'amount'] } },
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
              id: 'main.orders',
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
      plugins: [defaultAccess(), sharingRules(), restrictionRules()],
    });
    const resource = { type: 'database.collection', id: 'main.orders' };

    await authorization.defaultAccess.set({
      resource,
      actions: ['read'],
      scope: { type: 'all' },
    });
    await authorization.sharingRules.create({
      key: 'shared-orders',
      resource,
      actions: ['read'],
      subjects: [{ type: 'user', id: 'alice' }],
      selection: { type: 'records', recordIds: ['order-1'] },
    });
    await authorization.restrictionRules.create({
      key: 'owned-orders-only',
      resource,
      actions: ['read'],
      subjects: [{ type: 'user', id: 'alice' }],
      scope: {
        type: 'database',
        recordAccess: 'recordsIOwn',
      },
    });

    await expect(
      authorization.defaultAccess.get(resource.type, resource.id),
    ).resolves.toMatchObject({ scope: { type: 'all' } });
    await expect(authorization.sharingRules.list()).resolves.toMatchObject([
      {
        key: 'shared-orders',
        selection: { type: 'records', recordIds: ['order-1'] },
      },
    ]);
    await expect(authorization.restrictionRules.list()).resolves.toMatchObject([
      { key: 'owned-orders-only' },
    ]);
  });
});
