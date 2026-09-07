import type { DatabaseConnection, DatabaseDialect } from '@nocobase/db';

/** MySQL encodes Date values using the connection timezone; ISO text is not a DATETIME literal. */
export function databaseTime<T extends string | null | undefined>(
  value: T,
  dialect: DatabaseDialect,
): T | Date {
  return value == null || dialect !== 'mysql' ? value : new Date(value);
}

/** Drivers may return Date objects; the public service always returns ISO timestamps. */
export function timestamp(value: string | Date, timezone?: string): string {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value) &&
    timezone &&
    timezone !== 'local'
  ) {
    return new Date(value.replace(' ', 'T') + timezone).toISOString();
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
export function optionalTimestamp(
  value: string | Date | null | undefined,
  timezone?: string,
): string | undefined {
  return value == null ? undefined : timestamp(value, timezone);
}

/** Read the driver timezone without changing connection settings. */
export async function databaseTimezone(
  connection: DatabaseConnection,
): Promise<string | undefined> {
  if (connection.dialect !== 'mysql') return undefined;
  const client = await connection.client<{
    client: { config: { connection: { timezone?: string } } };
  }>();
  return client.client.config.connection.timezone;
}
