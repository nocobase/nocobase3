import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query compile', (context) => {
  it('compiles select SQL with connection tablePrefix', async () => {
    const compiled = context.database
      .query()
      .selectFrom('queryOrders')
      .select(['orderNo', 'createdAt'])
      .where('status', '=', 'paid')
      .compile();

    expect(compiled.sql).toContain(context.table('queryOrders'));
    expect(compiled.sql).toContain('order_no');
    expect(compiled.sql).toContain('created_at');
    expect(compiled.parameters).toContain('paid');
  });

  it('compiles insert, update, and delete operations', async () => {
    const insertSql = context.database
      .query()
      .insertInto('queryOrders')
      .values({ orderNo: 'SO-001', status: 'paid' })
      .compile();
    expect(insertSql.sql).toContain(context.table('queryOrders'));
    expect(insertSql.sql).toContain('order_no');
    expect(insertSql.parameters).toContain('SO-001');

    const updateSql = context.database
      .query()
      .updateTable('queryOrders')
      .set({ status: 'archived' })
      .where('orderNo', '=', 'SO-001')
      .compile();
    expect(updateSql.sql).toContain(context.table('queryOrders'));
    expect(updateSql.sql).toContain('order_no');
    expect(updateSql.parameters).toContain('archived');
    expect(updateSql.parameters).toContain('SO-001');

    const deleteSql = context.database
      .query()
      .deleteFrom('queryOrders')
      .where('orderNo', '=', 'SO-001')
      .compile();
    expect(deleteSql.sql).toContain(context.table('queryOrders'));
    expect(deleteSql.sql).toContain('order_no');
    expect(deleteSql.parameters).toContain('SO-001');
  });

  it('rejects schema-qualified table sources', async () => {
    expect(() =>
      context.database.query().selectFrom('public.queryOrders').compile(),
    ).toThrow(
      'Query table sources do not support schema-qualified identifiers.',
    );
  });
});
