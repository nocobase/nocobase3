import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationDefinition,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import permissionSets from '../database/migrations/202608210001_create_permission_set_tables.js';
import defaultAccess from '../database/migrations/202608210002_create_default_access_rules.js';
import sharingRules from '../database/migrations/202608210003_create_sharing_rules.js';
import restrictionRules from '../database/migrations/202608210004_create_restriction_rules.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
  };
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  permissionSets,
  defaultAccess,
  sharingRules,
  restrictionRules,
];

/** Physical table names the library's default stores read and write. */
const TABLES = [
  'authorization_permission_sets',
  'authorization_permission_set_assignments',
  'authorization_default_access_rules',
  'authorization_default_access_rule_records',
  'authorization_sharing_rules',
  'authorization_sharing_rule_assignments',
  'authorization_sharing_rule_records',
  'authorization_restriction_rules',
  'authorization_restriction_rule_assignments',
  'authorization_restriction_rule_records',
] as const;

describe('authorization table migrations', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates every store table on up and removes them on down', async () => {
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    const client = await connection.client<SqliteClient>();
    const tables = (): Promise<boolean[]> =>
      Promise.all(TABLES.map((table) => client.schema.hasTable(table)));

    for (const migration of MIGRATIONS) await migration.up(context);
    expect(await tables()).toEqual(TABLES.map(() => true));

    for (const migration of [...MIGRATIONS].reverse()) {
      await migration.down?.(context);
    }
    expect(await tables()).toEqual(TABLES.map(() => false));
  });
});
