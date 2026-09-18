import operatorKeysMigration from '../database/migrations/202609170001_operator_manage_own_api_keys.js';
import operatorRemovalMigration from '../database/migrations/202609160008_operator_remove_own_apps.js';
import removeDeploymentMode from '../database/migrations/202609160006_remove_deployment_mode.js';
import configFingerprintMigration from '../database/migrations/202609160007_release_config_fingerprint.js';
import publishingMigration from '../database/migrations/202609160005_release_publishing.js';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ownershipMigration from '../database/migrations/202609160004_hub_app_ownership.js';
import appTablesMigration from '../database/migrations/202609010001_create_hub_app_tables.js';
import permissionSetsMigration from '../database/migrations/202609080001_create_hub_permission_sets.js';
import eventsMigration from '../database/migrations/202609170001_add_deployment_events.js';
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

  it('adds and reverses the publishing configuration fingerprint while preserving existing rows', async () => {
    await migrate(appTablesMigration, 'up', database);
    await migrate(publishingMigration, 'up', database);
    await database
      .query()
      .insertInto('hubReleaseChecksums')
      .values({ appId: 'crm', checksum: 'a'.repeat(64), releaseId: 'old' })
      .execute();
    await migrate(configFingerprintMigration, 'up', database);
    const client = await database.connection().client<SqliteClient>();
    expect(
      await client.schema.hasColumn(
        'hub_release_checksums',
        'config_fingerprint',
      ),
    ).toBe(true);
    expect(
      await database
        .query()
        .selectFrom('hubReleaseChecksums')
        .selectAll()
        .execute(),
    ).toMatchObject([{ releaseId: 'old', configFingerprint: null }]);
    await migrate(configFingerprintMigration, 'down', database);
    expect(
      await client.schema.hasColumn(
        'hub_release_checksums',
        'config_fingerprint',
      ),
    ).toBe(false);
    await migrate(configFingerprintMigration, 'up', database);
    expect(
      await database
        .query()
        .selectFrom('hubReleaseChecksums')
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it('preserves duplicate release history while selecting a canonical checksum and reverses publishing tables', async () => {
    await migrate(appTablesMigration, 'up', database);
    for (const id of ['old', 'new'])
      await database
        .query()
        .insertInto('hubAppReleases')
        .values({
          id,
          appId: 'crm',
          version: '1.0.0',
          artifactKey: id,
          checksum: 'a'.repeat(64),
          size: 1,
          configTemplate: null,
          manifest: null,
          createdAt: new Date(id === 'old' ? '2026-01-01' : '2026-02-01'),
        })
        .execute();
    await migrate(publishingMigration, 'up', database);
    expect(
      await database.query().selectFrom('hubAppReleases').selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database
        .query()
        .selectFrom('hubReleaseChecksums')
        .selectAll()
        .execute(),
    ).toMatchObject([{ releaseId: 'old' }]);
    await expect(
      database
        .query()
        .insertInto('hubReleaseChecksums')
        .values({ appId: 'crm', checksum: 'a'.repeat(64), releaseId: 'new' })
        .execute(),
    ).rejects.toThrow();
    await migrate(removeDeploymentMode, 'up', database);
    const schema = await database.connection().client<SqliteClient>();
    expect(await schema.schema.hasColumn('hub_apps', 'deployment_mode')).toBe(
      false,
    );
    await migrate(removeDeploymentMode, 'down', database);
    await migrate(publishingMigration, 'down', database);
    const client = await database.connection().client<SqliteClient>();
    expect(await client.schema.hasColumn('hub_apps', 'deployment_mode')).toBe(
      false,
    );
    expect(await client.schema.hasTable('hub_release_checksums')).toBe(false);
    await migrate(publishingMigration, 'up', database);
    expect(
      await database
        .query()
        .selectFrom('hubReleaseChecksums')
        .selectAll()
        .execute(),
    ).toHaveLength(1);
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

  it('adds nullable ownership without assigning legacy Apps and reverses schema and metadata', async () => {
    await migrate(appTablesMigration, 'up', database);
    const query = database.query();
    await query
      .insertInto('hubApps')
      .values({
        id: 'legacy',
        name: 'Legacy',
        enabled: false,
        basePath: '/legacy',
        backend: 'in-process',
        startupMode: 'lazy',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await migrate(ownershipMigration, 'up', database);
    const client = await database.connection().client<SqliteClient>();
    expect(await client.schema.hasColumn('hub_apps', 'created_by')).toBe(true);
    expect(
      (await metadataStore.get('hubApps'))?.document.fields,
    ).toHaveProperty('createdBy');
    expect(
      await query.selectFrom('hubApps').select(['id', 'createdBy']).execute(),
    ).toEqual([{ id: 'legacy', createdBy: null }]);
    await migrate(ownershipMigration, 'down', database);
    expect(await client.schema.hasColumn('hub_apps', 'created_by')).toBe(false);
    expect(
      (await metadataStore.get('hubApps'))?.document.fields,
    ).not.toHaveProperty('createdBy');
    await migrate(ownershipMigration, 'up', database);
    expect(await query.selectFrom('hubApps').select('id').execute()).toEqual([
      { id: 'legacy' },
    ]);
  });

  it('adds and rolls back the nullable event journal without removing deployment history', async () => {
    await migrate(appTablesMigration, 'up', database);
    await database
      .connection()
      .query.insertInto('hubAppDeployments')
      .values({
        id: 'old',
        appId: 'customer',
        releaseId: 'release',
        kind: 'deploy',
        status: 'failed',
        phase: 'completed',
        config: JSON.stringify({ mode: 'external' }),
        createdAt: new Date(),
      })
      .execute();
    await migrate(eventsMigration, 'up', database);
    const row = await database
      .connection()
      .query.selectFrom('hubAppDeployments')
      .selectAll()
      .where('id', '=', 'old')
      .executeTakeFirstOrThrow();
    expect(row.events).toBeNull();
    await migrate(eventsMigration, 'down', database);
    expect(
      await database
        .connection()
        .query.selectFrom('hubAppDeployments')
        .select('id')
        .execute(),
    ).toEqual([{ id: 'old' }]);
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

  it.each([
    { action: 'remove', migration: operatorRemovalMigration },
    { action: 'manage-api-keys', migration: operatorKeysMigration },
  ])(
    'adds Operator $action once while preserving other grants, roles, and assignments',
    async ({ action, migration }) => {
      await createAuthorizationTables(database);
      await migrate(permissionSetsMigration, 'up', database);
      const query = database.connection().query;
      const customGrant = {
        resource: { type: 'custom.resource', id: 'mine' },
        actions: [{ action: 'read', policy: { type: 'custom-policy' } }],
      };
      const before = await query
        .selectFrom('authorizationPermissionSets')
        .selectAll()
        .orderBy('key')
        .execute();
      const operator = before.find((role) => role.key === 'hub-operator')!;
      const grants = (
        typeof operator.grants === 'string'
          ? JSON.parse(operator.grants)
          : operator.grants
      ) as unknown[];
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify([...grants, customGrant]) })
        .where('key', '=', 'hub-operator')
        .execute();
      const assignments = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .selectAll()
        .execute();

      await migrate(migration, 'up', database);
      const after = await query
        .selectFrom('authorizationPermissionSets')
        .selectAll()
        .orderBy('key')
        .execute();
      const changed = after.find((role) => role.key === 'hub-operator')!;
      const updated = (
        typeof changed.grants === 'string'
          ? JSON.parse(changed.grants)
          : changed.grants
      ) as unknown[];
      expect(updated).toEqual([
        ...grants.map((grant) => {
          const value = grant as {
            resource: { type: string; id: string };
            actions: { action: string }[];
          };
          return value.resource.type === 'hub.app' && value.resource.id === '*'
            ? { ...value, actions: [...value.actions, { action }] }
            : value;
        }),
        customGrant,
      ]);
      expect(after.filter((role) => role.key !== 'hub-operator')).toEqual(
        before.filter((role) => role.key !== 'hub-operator'),
      );
      expect(
        await query
          .selectFrom('authorizationPermissionSetAssignments')
          .selectAll()
          .execute(),
      ).toEqual(assignments);
      await migrate(migration, 'up', database);
      expect(
        await query
          .selectFrom('authorizationPermissionSets')
          .selectAll()
          .orderBy('key')
          .execute(),
      ).toEqual(after);
    },
  );

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
