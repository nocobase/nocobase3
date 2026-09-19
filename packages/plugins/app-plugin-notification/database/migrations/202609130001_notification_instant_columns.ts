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
const DISPATCH_INSTANTS = ['createdAt', 'updatedAt'] as const;
const DELIVERY_INSTANTS = [
  'nextRunAt',
  'leaseExpiresAt',
  'createdAt',
  'updatedAt',
] as const;
const ATTEMPT_INSTANTS = ['startedAt', 'finishedAt'] as const;

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
      `Migration 202609130001 needs the session time zone pinned to UTC to convert these columns, but it is "${String(pinned)}". Run it inside a transaction.`,
    );
}

const migration: MigrationDefinition = defineMigration({
  name: '202609130001_notification_instant_columns',

  async up({ builder, connection }): Promise<void> {
    await pinPostgresSessionToUtc(connection);
    for (const name of DISPATCH_INSTANTS) {
      await builder.alterField('notificationDispatches', name, {
        type: 'datetimeTz',
        nullable: false,
      });
    }
    for (const name of DELIVERY_INSTANTS) {
      await builder.alterField('notificationDeliveries', name, {
        type: 'datetimeTz',
        nullable: name === 'nextRunAt' || name === 'leaseExpiresAt',
      });
    }
    for (const name of ATTEMPT_INSTANTS) {
      await builder.alterField('notificationDeliveryAttempts', name, {
        type: 'datetimeTz',
        nullable: name === 'finishedAt',
      });
    }
    await builder.alterField('notificationDeliveryRetryAudits', 'createdAt', {
      type: 'datetimeTz',
      nullable: false,
    });
  },

  async down({ builder, connection }): Promise<void> {
    await pinPostgresSessionToUtc(connection);
    await builder.alterField('notificationDeliveryRetryAudits', 'createdAt', {
      type: 'datetime',
      nullable: false,
    });
    for (const name of ATTEMPT_INSTANTS) {
      await builder.alterField('notificationDeliveryAttempts', name, {
        type: 'datetime',
        nullable: name === 'finishedAt',
      });
    }
    for (const name of DELIVERY_INSTANTS) {
      await builder.alterField('notificationDeliveries', name, {
        type: 'datetime',
        nullable: name === 'nextRunAt' || name === 'leaseExpiresAt',
      });
    }
    for (const name of DISPATCH_INSTANTS) {
      await builder.alterField('notificationDispatches', name, {
        type: 'datetime',
        nullable: false,
      });
    }
  },
});

export default migration;
