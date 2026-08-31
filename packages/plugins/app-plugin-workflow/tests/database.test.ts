import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  validateMigrations,
  validateSeeds,
} from '@nocobase/app-database';
import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';

import migration from '../database/migrations/202608200001_create_workflow_collections.js';

describe('@nocobase/app-plugin-workflow database', () => {
  it('provides the workflow collections migration and no seeds', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    const migrations = await validateMigrations(migrationsDirectory);
    expect(migrations.map((migration) => migration.name)).toEqual([
      '202608200001_create_workflow_collections',
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });

  it('creates and drops the fixed workflow schema', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      const connection = database.connection();
      const context = {
        builder: connection.builder,
        query: connection.query,
        connection,
      };
      const tables = [
        'workflows',
        'workflow_nodes',
        'workflow_runs',
        'workflow_node_runs',
        'workflow_stats',
        'workflow_version_stats',
      ];

      await migration.up(context);
      const db = await connection.client<Knex>();
      await expect(
        Promise.all(tables.map((table) => db.schema.hasTable(table))),
      ).resolves.toEqual(tables.map(() => true));

      await migration.down(context);
      await expect(
        Promise.all(tables.map((table) => db.schema.hasTable(table))),
      ).resolves.toEqual(tables.map(() => false));
    } finally {
      await database.destroy();
    }
  });
});
