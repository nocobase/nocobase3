import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609010001_create_hub_app_tables.js';

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
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the App, Release, and Deployment schema', async () => {
    await migrate('up', database);
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
    await migrate('up', database);
    await migrate('down', database);
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
});

async function migrate(
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
