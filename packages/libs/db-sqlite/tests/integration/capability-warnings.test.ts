import { expect, it } from 'vitest';
import {
  installDatabaseIntegrationAdapter,
  useIntegrationDatabase,
} from '@nocobase/db-testkit';
import { sqliteDialectIntegrationAdapter } from './adapter.js';

installDatabaseIntegrationAdapter(sqliteDialectIntegrationAdapter);

const context = useIntegrationDatabase({
  name: 'sqlite',
  dialect: 'sqlite',
  filename: ':memory:',
});

it('warns and skips unsupported materialized views without throwing', async () => {
  const result = await context.builder.createMaterializedViewCollection(
    'usersSnapshot',
    (view) => {
      view.string('email');
      view.as((query) => query.from('users').select('email'));
    },
  );

  expect(result.warnings).toEqual([
    expect.objectContaining({
      code: 'UNSUPPORTED_MATERIALIZED_VIEW',
      severity: 'unsafe',
      fallback: 'skip',
    }),
  ]);
  expect(result.schemaOperations).toEqual([]);
  expect(await context.db.schema.hasTable(context.table('usersSnapshot'))).toBe(
    false,
  );
});
