import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  installDatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import { mysqlDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(mysqlDialectIntegrationAdapter);

describeIntegrationDatabases('MySQL managed schema reset', (context) => {
  it('restores the session foreign_key_checks value', async () => {
    await context.db.raw('set foreign_key_checks = 0');
    await context.connection.resetManagedSchema();

    const disabled = rows(
      await context.db.raw('select @@session.foreign_key_checks as value'),
    );
    expect(Number(disabled[0]?.value)).toBe(0);

    await context.db.raw('set foreign_key_checks = 1');
    await context.connection.resetManagedSchema();

    const enabled = rows(
      await context.db.raw('select @@session.foreign_key_checks as value'),
    );
    expect(Number(enabled[0]?.value)).toBe(1);
  });
});

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result))
    return (Array.isArray(result[0]) ? result[0] : result) as Array<
      Record<string, unknown>
    >;
  return result && typeof result === 'object' && 'rows' in result
    ? (result as { rows: Array<Record<string, unknown>> }).rows
    : [];
}
