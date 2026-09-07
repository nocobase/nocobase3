import type { DatabaseConnection } from '@nocobase/db';
import { AuditError } from '../errors.js';
import { auditRows } from './sql-client.js';

/** Read-only readiness check after explicit provisioning of this exact connection. */
export async function assertAuditSchema(
  connection: DatabaseConnection,
): Promise<void> {
  await auditRows(
    connection,
    'SELECT "eventHash", "scopeIndex", "actorIndex", "operationIndex", "requestIndex", "runIndex", "eventVersion", "kind", "producer", "recordedAt", "action", "outcome", "actorType", "actorId", "targetResource", "targetDataSource", "operationId", "requestId", "runId", "correlationId", "policyVersion" FROM "auditEvents" LIMIT 0',
  );
  await auditRows(
    connection,
    'SELECT "scopeHash", "appId", "securityScope", "revision", "settings" FROM "auditSettings" LIMIT 0',
  );
  let indexes: Record<string, unknown>[];
  if (connection.dialect === 'sqlite') {
    const columns = await auditRows(
      connection,
      'PRAGMA table_info("auditEvents")',
    );
    const required = [
      'id',
      'eventVersion',
      'kind',
      'producer',
      'occurredAt',
      'recordedAt',
      'action',
      'outcome',
      'appId',
      'securityScope',
      'store',
      'actorType',
      'actorId',
      'targetResource',
      'targetKeyHash',
      'targetKeyEncoding',
      'targetDataSource',
      'operationId',
      'requestId',
      'runId',
      'correlationId',
      'policyVersion',
      'idempotencyHash',
      'idempotencyScope',
      'fingerprint',
      'payload',
      'eventHash',
      'scopeIndex',
      'actorIndex',
      'operationIndex',
      'requestIndex',
      'runIndex',
    ];
    if (
      required.some(
        (name) => !columns.some((column) => column.name === name),
      ) ||
      columns.filter((column) => Number(column.pk) > 0).length !== 1 ||
      !columns.some((column) => column.name === 'eventHash' && column.pk === 1)
    )
      throw new AuditError('AUDIT_NOT_READY');
    const settings = await auditRows(
      connection,
      'PRAGMA table_info("auditSettings")',
    );
    if (
      ['scopeHash', 'appId', 'securityScope', 'revision', 'settings'].some(
        (name) => !settings.some((column) => column.name === name),
      )
    )
      throw new AuditError('AUDIT_NOT_READY');
    indexes = await auditRows(connection, 'PRAGMA index_list("auditEvents")');
    const uniqueColumns = await auditRows(
      connection,
      'PRAGMA index_info("audit_events_idempotency")',
    );
    if (
      uniqueColumns.length !== 1 ||
      uniqueColumns[0].name !== 'idempotencyHash' ||
      !indexes.some(
        (row) =>
          row.name === 'audit_events_idempotency' &&
          row.unique === 1 &&
          row.partial === 0,
      )
    )
      throw new AuditError('AUDIT_NOT_READY');
  } else if (connection.dialect === 'postgres') {
    const primary = await auditRows(
      connection,
      'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = ?::regclass AND contype = ?',
      ['"auditEvents"', 'p'],
    );
    if (
      primary.length !== 1 ||
      primary[0].definition !== 'PRIMARY KEY ("eventHash")'
    )
      throw new AuditError('AUDIT_NOT_READY');
    indexes = await auditRows(
      connection,
      'SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?',
      ['auditEvents', 'audit_events_idempotency'],
    );
    if (
      indexes.length !== 1 ||
      typeof indexes[0].indexdef !== 'string' ||
      !/CREATE UNIQUE INDEX .*\("idempotencyHash"\)$/.test(indexes[0].indexdef)
    )
      throw new AuditError('AUDIT_NOT_READY');
  } else {
    const primary = await auditRows(
      connection,
      'SELECT COLUMN_NAME AS name, SUB_PART AS prefixLength FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      ['auditEvents', 'PRIMARY'],
    );
    if (
      primary.length !== 1 ||
      primary[0].name !== 'eventHash' ||
      primary[0].prefixLength !== null
    )
      throw new AuditError('AUDIT_NOT_READY');
    const tables = await auditRows(
      connection,
      'SELECT ENGINE AS engine FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?)',
      ['auditEvents', 'auditSettings'],
    );
    if (
      tables.length !== 2 ||
      tables.some((table) => table.engine !== 'InnoDB')
    )
      throw new AuditError('AUDIT_NOT_READY');
    indexes = await auditRows(
      connection,
      'SELECT COLUMN_NAME AS name, NON_UNIQUE AS nonunique, SUB_PART AS prefixLength FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      ['auditEvents', 'audit_events_idempotency'],
    );
    if (
      indexes.length !== 1 ||
      indexes[0].name !== 'idempotencyHash' ||
      Number(indexes[0].nonunique) !== 0 ||
      indexes[0].prefixLength !== null
    )
      throw new AuditError('AUDIT_NOT_READY');
  }
}
