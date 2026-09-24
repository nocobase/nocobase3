// @vitest-environment node

import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  validateMigrations,
  validateSeeds,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { describe, expect, it } from 'vitest';
import permissionSetTables from '../../database/migrations/202608210001_create_permission_set_tables.js';
import {
  createSqliteDatabase,
  migrationContext,
} from '../helpers/database-fixture.js';

interface SqliteClient {
  readonly schema: { hasTable(name: string): Promise<boolean> };
}

describe('@nocobase/app-plugin-authorization database', () => {
  it('loads the permission set migrations and the built-in role seeds', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../../database/seeds', import.meta.url),
    );

    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      { name: '202608210001_create_permission_set_tables' },
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toMatchObject([
      {
        name: '202608240001_authorization_create_root_set',
      },
      {
        name: '202608250002_authorization_create_member_set',
      },
    ]);
  });

  it('assigns the root permission set to the configured initial administrator', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const source = (plugin: string, kind: 'migrations' | 'seeds') => ({
      packageName: `@nocobase/${plugin}`,
      directory: fileURLToPath(
        new URL(`../../../${plugin}/database/${kind}`, import.meta.url),
      ),
    });
    try {
      await createMigrator({
        database,
        sources: [
          source('app-plugin-authentication', 'migrations'),
          source('app-plugin-authorization', 'migrations'),
        ],
      }).latest();
      const query = database.connection().query;
      await query
        .insertInto('user')
        .values({
          id: 'initial-admin',
          name: 'Custom administrator',
          username: 'custom.admin',
          email: 'admin@example.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
      const seeder = createSeeder({
        database,
        sources: [source('app-plugin-authorization', 'seeds')],
        config: {
          get<T>(key: string): T | undefined {
            return (
              key === 'users.initialAdmin.username' ? 'Custom.Admin' : undefined
            ) as T | undefined;
          },
        },
      });
      await seeder.run();
      await seeder.run();
      expect(
        await query
          .selectFrom('authorizationPermissionSetAssignments')
          .select(['subjectId', 'permissionSetKey'])
          .where('permissionSetKey', '=', 'root')
          .execute(),
      ).toEqual([{ subjectId: 'initial-admin', permissionSetKey: 'root' }]);
    } finally {
      await database.destroy();
    }
  });

  it('creates and removes the permission set tables on up and down', async () => {
    const database = createSqliteDatabase();
    try {
      const connection = database.connection();
      const client = await connection.client<SqliteClient>();
      const tables = (): Promise<boolean[]> =>
        Promise.all(
          [
            'authorization_permission_sets',
            'authorization_permission_set_assignments',
          ].map((table) => client.schema.hasTable(table)),
        );

      await permissionSetTables.up(migrationContext(connection));
      expect(await tables()).toEqual([true, true]);
      await permissionSetTables.down?.(migrationContext(connection));
      expect(await tables()).toEqual([false, false]);
    } finally {
      await database.destroy();
    }
  });
});
