import type { DatabaseConnection } from '@nocobase/db';
import { AuditError } from '../errors.js';
export interface AuditSqlClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}
/** Only fixed infrastructure templates reach this helper. Values remain bound. */
export function sqlFor(
  connection: Pick<DatabaseConnection, 'dialect'>,
  sql: string,
): string {
  return connection.dialect === 'mysql'
    ? sql
        .replace(/"([A-Za-z][A-Za-z0-9_]*)"/g, '`$1`')
        .replace(/ = \?/g, ' = BINARY ?')
    : sql;
}
export async function auditRaw(
  connection: DatabaseConnection,
  sql: string,
  bindings: readonly unknown[] = [],
): Promise<unknown> {
  return (await connection.client<AuditSqlClient>()).raw(
    sqlFor(connection, sql),
    bindings,
  );
}
export async function auditRows(
  connection: DatabaseConnection,
  sql: string,
  bindings: readonly unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await auditRaw(connection, sql, bindings);
  const rows: unknown =
    connection.dialect === 'postgres'
      ? result !== null && typeof result === 'object' && 'rows' in result
        ? result.rows
        : undefined
      : connection.dialect === 'mysql' && Array.isArray(result)
        ? result[0]
        : result;
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row: unknown) =>
        row === null || typeof row !== 'object' || Array.isArray(row),
    )
  )
    throw new AuditError('AUDIT_WRITE_FAILED');
  return rows as Record<string, unknown>[];
}
export function storedText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new AuditError('AUDIT_WRITE_FAILED');
  return value;
}
