import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  installDatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import { damengDialectIntegrationAdapter } from './adapter.js';

installDatabaseIntegrationAdapter(damengDialectIntegrationAdapter);

describeIntegrationDatabases('Dameng managed schema reset', (context) => {
  it('drops views and sequences', async () => {
    const view = context.identifier('resetView');
    const sequence = context.identifier('resetSequence');

    await context.db.raw(`create view ${view} as select 1 as id from dual`);
    await context.db.raw(`create sequence ${sequence}`);

    await context.connection.resetManagedSchema();

    const viewResult = await context.db.raw(
      'select count(*) as "count" from user_views where view_name = upper(?)',
      [view],
    );
    const sequenceResult = await context.db.raw(
      'select count(*) as "count" from user_sequences where sequence_name = upper(?)',
      [sequence],
    );
    expect(count(viewResult)).toBe(0);
    expect(count(sequenceResult)).toBe(0);
  });
});

function count(result: unknown): number {
  const row = Array.isArray(result)
    ? Array.isArray(result[0])
      ? result[0][0]
      : result[0]
    : result && typeof result === 'object' && 'rows' in result
      ? (result as { rows: Array<Record<string, unknown>> }).rows[0]
      : undefined;
  const value =
    row && typeof row === 'object'
      ? ((row as Record<string, unknown>).count ??
        (row as Record<string, unknown>).COUNT)
      : undefined;
  return Number(value);
}
