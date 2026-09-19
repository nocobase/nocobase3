import type { Knex } from 'knex';
import type { MigrationConnection } from '../../migration/types.js';
import type { SeedHistoryRecord } from '../types.js';

export const DEFAULT_SEED_TABLE = '__nocobase_seeds';

interface SeedHistoryRow {
  id: number;
  package_name: string;
  name: string;
  checksum: string;
  executed_at: Date | string;
  duration_ms: number | null;
}

export async function ensureSeedTable(
  connection: MigrationConnection,
  tableName: string = DEFAULT_SEED_TABLE,
): Promise<void> {
  const knex = await connection.client<Knex>();
  if (await knex.schema.hasTable(tableName)) {
    return;
  }

  try {
    await knex.schema.createTable(
      tableName,
      (table: Knex.CreateTableBuilder) => {
        table.increments('id').primary();
        table.string('package_name', 191).notNullable();
        table.string('name', 191).notNullable().unique();
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

export async function readSeedHistory(
  connection: MigrationConnection,
  tableName: string = DEFAULT_SEED_TABLE,
): Promise<SeedHistoryRecord[]> {
  const knex = await connection.client<Knex>();
  const rows = await knex<SeedHistoryRow>(tableName)
    .select([
      'id',
      'package_name',
      'name',
      'checksum',
      'executed_at',
      'duration_ms',
    ])
    .orderBy('id', 'asc');

  return rows.map((row) => ({
    id: Number(row.id),
    packageName: String(row.package_name),
    name: String(row.name),
    checksum: String(row.checksum),
    executedAt: row.executed_at,
    durationMs:
      row.duration_ms === null || row.duration_ms === undefined
        ? null
        : Number(row.duration_ms),
  }));
}

export async function recordSeedCompleted(
  connection: MigrationConnection,
  options: {
    tableName?: string;
    packageName: string;
    name: string;
    checksum: string;
    durationMs: number;
  },
): Promise<void> {
  const knex = await connection.client<Knex>();
  await knex(options.tableName ?? DEFAULT_SEED_TABLE).insert({
    package_name: options.packageName,
    name: options.name,
    checksum: options.checksum,
    executed_at: new Date(),
    duration_ms: options.durationMs,
  });
}
