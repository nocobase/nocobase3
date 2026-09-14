import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import appTablesMigration from '../database/migrations/202609010001_create_hub_app_tables.js';
import permissionSetsMigration from '../database/migrations/202609080001_create_hub_permission_sets.js';
import administratorSeed from '../database/seeds/202609080001_assign_hub_administrator.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const COLLECTIONS = [
  ['hubApps', 'hub_apps'],
  ['hubAppReleases', 'hub_app_releases'],
  ['hubAppDeployments', 'hub_app_deployments'],
] as const;

describe('@nocobase/app-plugin-hub database migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the App, Release, and Deployment schema', async () => {
    await migrate(appTablesMigration, 'up', database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual([true, true, true]);
    await expect(
      Promise.all([
        client.schema.hasColumn('hub_apps', 'current_deployment_id'),
        client.schema.hasColumn('hub_apps', 'config'),
        client.schema.hasColumn('hub_app_releases', 'config_template'),
        client.schema.hasColumn('hub_app_deployments', 'release_id'),
        client.schema.hasColumn('hub_app_deployments', 'config'),
      ]),
    ).resolves.toEqual([true, false, true, true, true]);
    await expect(
      metadataStore.get('hubAppReleases').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: { configTemplate: { type: 'text' } },
    });
    await expect(
      metadataStore.get('hubAppDeployments').then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: { config: { type: 'json' } },
    });
    const appMetadata = await metadataStore.get('hubApps');
    expect(appMetadata?.document.fields).toBeDefined();
    expect(appMetadata?.document.fields).not.toHaveProperty('config');
  });

  it('drops the schema and metadata', async () => {
    await migrate(appTablesMigration, 'up', database);
    await migrate(appTablesMigration, 'down', database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual([false, false, false]);
    for (const [collection] of COLLECTIONS) {
      await expect(metadataStore.get(collection)).resolves.toBeUndefined();
    }
  });

  it('creates fixed Hub roles and upgrades every system administrator', async () => {
    await createAuthorizationTables(database);
    const query = database.connection().query;
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'system-administrator',
        key: 'system-administrator',
        title: 'System administrator',
        grants: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values([
        {
          id: 'user:admin-1:system-administrator',
          subjectType: 'user',
          subjectId: 'admin-1',
          permissionSetKey: 'system-administrator',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'user:admin-1:hub-viewer',
          subjectType: 'user',
          subjectId: 'admin-1',
          permissionSetKey: 'hub-viewer',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await migrate(permissionSetsMigration, 'up', database);
    await migrate(permissionSetsMigration, 'up', database);

    const sets = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', 'in', ['hub-administrator', 'hub-operator', 'hub-viewer'])
      .orderBy('key', 'asc')
      .execute();
    expect(sets.map(({ key }) => key)).toEqual([
      'hub-administrator',
      'hub-operator',
      'hub-viewer',
    ]);
    expect(grantActions(sets[0]?.grants, 'user')).toEqual([
      'read',
      'create',
      'update',
      'disable',
      'enable',
      'assign-role',
      'reset-password',
      'revoke-sessions',
    ]);
    expect(grantActions(sets[1]?.grants, 'hub.app')).not.toContain('remove');
    expect(grantActions(sets[2]?.grants, 'hub.app')).toEqual([
      'read',
      'read-release',
      'read-deployment',
    ]);
    await expect(
      query
        .selectFrom('authorizationPermissionSetAssignments')
        .select(['subjectId', 'permissionSetKey'])
        .where('permissionSetKey', 'in', [
          'hub-administrator',
          'hub-operator',
          'hub-viewer',
        ])
        .execute(),
    ).resolves.toEqual([
      { subjectId: 'admin-1', permissionSetKey: 'hub-administrator' },
    ]);

    await migrate(permissionSetsMigration, 'down', database);
    await expect(
      query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', 'in', ['hub-administrator', 'hub-operator', 'hub-viewer'])
        .execute(),
    ).resolves.toEqual([]);
  });

  it('assigns the initial system administrator after all seeds have run', async () => {
    await createAuthorizationTables(database);
    const query = database.connection().query;
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values([
        {
          id: 'system-administrator',
          key: 'system-administrator',
          title: 'System administrator',
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'hub-administrator',
          key: 'hub-administrator',
          title: 'Hub administrator',
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values([
        {
          id: 'user:admin-1:system-administrator',
          subjectType: 'user',
          subjectId: 'admin-1',
          permissionSetKey: 'system-administrator',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'user:admin-1:hub-operator',
          subjectType: 'user',
          subjectId: 'admin-1',
          permissionSetKey: 'hub-operator',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await administratorSeed.run({ query, connection: database.connection() });
    await administratorSeed.run({ query, connection: database.connection() });

    await expect(
      query
        .selectFrom('authorizationPermissionSetAssignments')
        .select(['subjectId', 'permissionSetKey'])
        .where('permissionSetKey', 'in', [
          'hub-administrator',
          'hub-operator',
          'hub-viewer',
        ])
        .execute(),
    ).resolves.toEqual([
      { subjectId: 'admin-1', permissionSetKey: 'hub-administrator' },
    ]);
  });
});

async function migrate(
  migration: typeof appTablesMigration,
  direction: 'up' | 'down',
  database: DatabaseManager,
): Promise<void> {
  const connection = database.connection();
  const context = {
    builder: connection.builder,
    query: connection.query,
    connection,
  };
  if (direction === 'up') await migration.up(context);
  else await migration.down?.(context);
}

async function createAuthorizationTables(database: DatabaseManager) {
  const builder = database.connection().builder;
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id').primary();
      collection.string('key').notNull().unique();
      collection.string('title').nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    },
  );
  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id').primary();
      collection.string('subjectType').notNull();
      collection.string('subjectId').notNull();
      collection.string('permissionSetKey').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['subjectType', 'subjectId', 'permissionSetKey']);
    },
  );
}

function grantActions(value: unknown, resourceType: string): string[] {
  const grants = (typeof value === 'string' ? JSON.parse(value) : value) as {
    resource: { type: string };
    actions: { action: string }[];
  }[];
  return (
    grants.find(({ resource }) => resource.type === resourceType)?.actions ?? []
  ).map(({ action }) => action);
}
