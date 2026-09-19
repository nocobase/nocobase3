import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  installDatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import { mssqlDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(mssqlDialectIntegrationAdapter);

describeIntegrationDatabases('MSSQL managed schema reset', (context) => {
  it('drops sequences', async () => {
    const sequence = context.identifier('resetSequence');

    await context.db.raw(
      `create sequence ${context.identifier('resetSequence')}`,
    );
    await context.connection.resetManagedSchema();

    const result = await context.db.raw(
      'select count(*) as [count] from sys.sequences where schema_id = schema_id(?) and name = ?',
      ['dbo', sequence],
    );
    expect(count(result)).toBe(0);
  });
});

function count(result: unknown): number {
  const row = Array.isArray(result)
    ? Array.isArray(result[0])
      ? result[0][0]
      : result[0]
    : result && typeof result === 'object' && 'recordset' in result
      ? (result as { recordset: Array<Record<string, unknown>> }).recordset[0]
      : undefined;
  const value =
    row && typeof row === 'object'
      ? ((row as Record<string, unknown>).count ??
        (row as Record<string, unknown>).COUNT)
      : undefined;
  return Number(value);
}
