import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Notification timestamps are UTC instants, not zone-free wall clocks.
 * Existing rows were written as UTC wall-clock values, so PostgreSQL must
 * perform the type conversion with its session time zone pinned to UTC.
 */
interface PostgresClient {
  raw(sql: string): Promise<void>;
  raw<T>(sql: string): Promise<T>;
}

async function pinPostgresSessionToUtc(
  connection: MigrationContext['connection'],
): Promise<void> {
  if (connection.dialect !== 'postgres') return;
  const client = await connection.client<PostgresClient>();
  await client.raw("SET LOCAL TIME ZONE 'UTC'");
  const result = await client.raw<{ rows?: { TimeZone?: string }[] }>(
    'SHOW TIME ZONE',
  );
  const pinned = result.rows?.[0]?.TimeZone;
  if (pinned !== 'UTC')
    throw new Error(
      `Migration 202609180001 needs the session time zone pinned to UTC to convert these columns, but it is "${String(pinned)}". Run it inside a transaction.`,
    );
}

const migration: MigrationDefinition = defineMigration({
  name: '202609180001_notification_in_app_instant_columns',
  async up({ builder, connection }): Promise<void> {
    await pinPostgresSessionToUtc(connection);
    await builder.alterField('notificationInAppItems', 'createdAt', {
      type: 'datetimeTz',
      nullable: false,
    });
    await builder.alterField('notificationInAppItems', 'updatedAt', {
      type: 'datetimeTz',
      nullable: false,
    });
    await builder.alterField('notificationInAppItems', 'readAt', {
      type: 'datetimeTz',
      nullable: true,
    });
  },
  async down({ builder, connection }): Promise<void> {
    await pinPostgresSessionToUtc(connection);
    await builder.alterField('notificationInAppItems', 'readAt', {
      type: 'datetime',
      nullable: true,
    });
    await builder.alterField('notificationInAppItems', 'updatedAt', {
      type: 'datetime',
      nullable: false,
    });
    await builder.alterField('notificationInAppItems', 'createdAt', {
      type: 'datetime',
      nullable: false,
    });
  },
});

export default migration;
