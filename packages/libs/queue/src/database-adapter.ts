import { randomUUID } from 'node:crypto';

import { KnexAdapter } from '@boringnode/queue/drivers/knex_adapter';
import type { AdapterFactory, ScheduleConfig } from '@boringnode/queue/types';
import { upsertPhysicalRow, type DatabaseConnection } from '@nocobase/db';
import type { Knex } from 'knex';

export interface DatabaseQueueAdapterOptions {
  readonly connection: DatabaseConnection;
  readonly tableName?: string;
  readonly schedulesTableName?: string;
}

/** The supplied database connection remains owned by DatabaseManager. */
export async function createDatabaseQueueAdapterFactory(
  options: DatabaseQueueAdapterOptions,
): Promise<AdapterFactory> {
  // The upstream adapter requires Knex. Keep that bridge private to this module.
  const client = await options.connection.client<Knex>();
  return () => new DatabaseQueueAdapter(options, client);
}

class DatabaseQueueAdapter extends KnexAdapter {
  private readonly database: DatabaseConnection;
  private readonly schedulesTable: string;

  constructor(options: DatabaseQueueAdapterOptions, client: Knex) {
    super({
      connection: client,
      tableName: options.tableName,
      schedulesTableName: options.schedulesTableName,
      ownsConnection: false,
    });
    this.database = options.connection;
    this.schedulesTable = options.schedulesTableName ?? 'queue_schedules';
  }

  public override async upsertSchedule(
    config: ScheduleConfig,
  ): Promise<string> {
    const id = config.id ?? randomUUID();
    const data = {
      name: config.name,
      payload: JSON.stringify(config.payload),
      cron_expression: config.cronExpression ?? null,
      every_ms: config.everyMs ?? null,
      timezone: config.timezone,
      from_date: config.from ?? null,
      to_date: config.to ?? null,
      run_limit: config.limit ?? null,
      status: 'active',
    };
    await upsertPhysicalRow(this.database, {
      table: this.schedulesTable,
      key: { id },
      create: { ...data, run_count: 0, created_at: new Date() },
      update: data,
    });
    return id;
  }
}
