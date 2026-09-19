import type { Knex } from 'knex';
import type { MigrationConnection, MigrationHistoryRecord } from '../types.js';

export const DEFAULT_MIGRATION_TABLE = '__nocobase_migrations';

interface MigrationHistoryRow {
  id: number;
  package_name: string;
  name: string;
  batch: number;
  checksum: string;
  executed_at: Date | string;
  duration_ms: number | null;
}

export async function ensureMigrationTable(
  connection: MigrationConnection,
  tableName: string = DEFAULT_MIGRATION_TABLE,
): Promise<void> {
  const knex = await connection.client<Knex>();
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) {
    try {
      await knex.schema.createTable(
        tableName,
        (table: Knex.CreateTableBuilder) => {
          table.increments('id').primary();
          table.string('package_name', 191).notNullable();
          table.string('name', 191).notNullable().unique();
          table.integer('batch').notNullable();
          table.string('checksum', 128).notNullable();
          table.dateTime('executed_at').notNullable();
          table.integer('duration_ms').nullable();
        },
      );
    } catch (error) {
      if (!(await knex.schema.hasTable(tableName))) {
        throw error;
      }
    }
  }

  await ensurePackageNameColumn(knex, tableName);
}

export async function readMigrationHistory(
  connection: MigrationConnection,
  tableName: string = DEFAULT_MIGRATION_TABLE,
): Promise<MigrationHistoryRecord[]> {
  const knex = await connection.client<Knex>();
  const rows = await knex<MigrationHistoryRow>(tableName)
    .select([
      'id',
      'package_name',
      'name',
      'batch',
      'checksum',
      'executed_at',
      'duration_ms',
    ])
    .orderBy('id', 'asc');

  return rows.map((row: MigrationHistoryRow) => ({
    id: Number(row.id),
    packageName: String(row.package_name),
    name: String(row.name),
    batch: Number(row.batch),
    checksum: String(row.checksum),
    executedAt: row.executed_at,
    durationMs:
      row.duration_ms === null || row.duration_ms === undefined
        ? null
        : Number(row.duration_ms),
  }));
}

export async function recordMigrationCompleted(
  connection: MigrationConnection,
  options: {
    tableName?: string;
    packageName?: string;
    name: string;
    batch: number;
    checksum: string;
    durationMs: number;
  },
): Promise<void> {
  const knex = await connection.client<Knex>();
  await knex(options.tableName ?? DEFAULT_MIGRATION_TABLE).insert({
    package_name: options.packageName ?? 'app',
    name: options.name,
    batch: options.batch,
    checksum: options.checksum,
    executed_at: new Date(),
    duration_ms: options.durationMs,
  });
}

export async function deleteMigrationHistoryRecord(
  connection: MigrationConnection,
  options: {
    tableName?: string;
    name: string;
  },
): Promise<void> {
  const knex = await connection.client<Knex>();
  await knex(options.tableName ?? DEFAULT_MIGRATION_TABLE)
    .where({ name: options.name })
    .delete();
}

async function ensurePackageNameColumn(
  knex: Knex,
  tableName: string,
): Promise<void> {
  if (await knex.schema.hasColumn(tableName, 'package_name')) {
    return;
  }

  await knex.schema.alterTable(tableName, (table: Knex.AlterTableBuilder) => {
    table.string('package_name', 191).notNullable().defaultTo('app');
  });
}
