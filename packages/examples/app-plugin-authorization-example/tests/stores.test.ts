import { createAuthorization } from '../../../plugins/app-plugin-authorization/tests/authorization-fixture.js';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import permissionSetMigration from '../../../plugins/app-plugin-authorization/database/migrations/202608210001_create_permission_set_tables.js';
import defaultAccessMigration from '../../../plugins/app-plugin-authz-default-access/database/migrations/202608210002_create_default_access_rules.js';
import sharingRulesMigration from '../../../plugins/app-plugin-authz-sharing-rules/database/migrations/202608210003_create_sharing_rules.js';
import restrictionRulesMigration from '../../../plugins/app-plugin-authz-restriction-rules/database/migrations/202608210004_create_restriction_rules.js';
import { permissionSetsPlugin } from '@nocobase/authorization/permission-sets';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { databasePlugin } from '../../../plugins/app-plugin-authorization/server/database/plugin.js';
import { DatabasePermissionSetStore } from '../../../plugins/app-plugin-authorization/server/stores/permission-sets.js';

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

  it('persists generic default, sharing, and restriction rules independently', async () => {
    const authorization = createAuthorization({
      connection: database.connection(),
      plugins: [
        permissionSetsPlugin({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
        databasePlugin(),
        defaultAccess(),
        sharingRules(),
        restrictionRules(),
      ],
    });
    const resource = { type: 'database.collection', id: 'orders' };

    await authorization.defaultAccess.create({
      key: 'orders-default',
      resource,
      actions: [{ action: 'read', selection: { type: 'all' } }],
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
          selection: { type: 'recordAccess', key: 'recordsIOwn' },
        },
      ],
      subjects: [{ type: 'user', id: 'alice' }],
    });

    await expect(
      authorization.defaultAccess.get('orders-default'),
    ).resolves.toMatchObject({
      actions: [{ action: 'read', selection: { type: 'all' } }],
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
        permissionSetsPlugin({
          store: new DatabasePermissionSetStore(() => database.connection()),
        }),
        databasePlugin(),
        defaultAccess(),
        sharingRules(),
        restrictionRules(),
      ],
    });
    const resource = { type: 'business', id: 'sales.submit' };
    const actions = [
      {
        action: 'submit',
        scopeKey: 'projects',
        selection: {
          type: 'records' as const,
          ids: ['shared-id', 'project-2'],
        },
      },
      {
        action: 'submit',
        scopeKey: 'quotes',
        selection: {
          type: 'records' as const,
          ids: ['shared-id', 'quote-2'],
        },
      },
    ];
    await authorization.defaultAccess.create({
      key: 'scoped-default',
      resource,
      actions,
    });
    await authorization.restrictionRules.create({
      key: 'scoped-restrictions',
      resource,
      actions,
      subjects: [],
    });
    const sharingActions = actions;
    await authorization.sharingRules.create({
      key: 'scoped-sharing',
      resource,
      actions: sharingActions,
      subjects: [],
    });
    await expect(
      authorization.defaultAccess.get('scoped-default'),
    ).resolves.toMatchObject({ actions });
    await expect(
      authorization.restrictionRules.get('scoped-restrictions'),
    ).resolves.toMatchObject({ actions });
    await expect(
      authorization.sharingRules.get('scoped-sharing'),
    ).resolves.toMatchObject({ actions: sharingActions });
    await authorization.defaultAccess.delete('scoped-default');
    await authorization.restrictionRules.delete('scoped-restrictions');
    await authorization.sharingRules.delete('scoped-sharing');
    await expect(
      authorization.defaultAccess.get('scoped-default'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.restrictionRules.get('scoped-restrictions'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.sharingRules.get('scoped-sharing'),
    ).resolves.toBeUndefined();
  });
});
