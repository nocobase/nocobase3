import type { DatabaseDialect } from '@nocobase/db';

/** Let the MySQL driver encode dates with its configured timezone. */
export function workflowDatabaseTime(
  value: string | null,
  dialect: DatabaseDialect,
): string | Date | null {
  return value === null || dialect !== 'mysql' ? value : new Date(value);
}
