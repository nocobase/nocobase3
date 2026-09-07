import type { DatabaseConnection } from '@nocobase/db';
import type { AuditTablePolicy } from '../contracts.js';
import { auditRows } from '../database/sql-client.js';

/** Enumerate physical names only. Registration does not opt any table into capture. */
export async function discoverAuditTableTargets(
  connection: DatabaseConnection,
): Promise<readonly AuditTablePolicy[]> {
  const sql =
    connection.dialect === 'sqlite'
      ? "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      : connection.dialect === 'postgres'
        ? 'SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = current_schema()'
        : "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'";
  const rows = await auditRows(connection, sql);
  return rows.flatMap((row) =>
    typeof row.name === 'string' &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name) &&
    !['auditevents', 'auditsettings'].includes(row.name.toLowerCase())
      ? [{ dataSource: connection.name, table: row.name }]
      : [],
  );
}
