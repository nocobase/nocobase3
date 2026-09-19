import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  installDatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import { kingbaseDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(kingbaseDialectIntegrationAdapter);

describeIntegrationDatabases('KingbaseES managed schema reset', (context) => {
  it('drops materialized views and sequences', async () => {
    const sourceTable = context.table('resetSource');
    const materializedView = context.identifier('resetMaterializedView');
    const sequence = context.identifier('resetSequence');

    await context.db.schema.createTable(sourceTable, (table) => {
      table.integer('id').primary();
    });
    await context.db.raw(
      `create materialized view ${context.identifier('resetMaterializedView')} as select * from ${sourceTable}`,
    );
    await context.db.raw(
      `create sequence ${context.identifier('resetSequence')}`,
    );

    await context.connection.resetManagedSchema();

    const materializedViewResult = await context.db.raw(
      'select exists (select 1 from pg_catalog.pg_class where relnamespace = current_schema()::regnamespace and relname = ? and relkind = ? ) as exists',
      [materializedView, 'm'],
    );
    const sequenceResult = await context.db.raw(
      'select exists (select 1 from pg_catalog.pg_class where relnamespace = current_schema()::regnamespace and relname = ? and relkind = ? ) as exists',
      [sequence, 'S'],
    );
    expect(hasTruthyExists(materializedViewResult)).toBe(false);
    expect(hasTruthyExists(sequenceResult)).toBe(false);
  });
});

function hasTruthyExists(result: unknown): boolean {
  const row = Array.isArray(result)
    ? Array.isArray(result[0])
      ? result[0][0]
      : result[0]
    : result && typeof result === 'object' && 'rows' in result
      ? (result as { rows: Array<Record<string, unknown>> }).rows[0]
      : undefined;
  const value =
    row && typeof row === 'object'
      ? (row as Record<string, unknown>).exists
      : undefined;
  return value === true || value === 1 || value === '1' || value === 't';
}
