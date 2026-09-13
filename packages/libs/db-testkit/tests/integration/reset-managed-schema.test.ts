import { expect, it, vi } from 'vitest';
import { describeIntegrationDatabases } from './helpers.js';

describeIntegrationDatabases('managed schema reset', (context) => {
  it('clears tables, foreign keys, views, and cached collection definitions', async () => {
    const parentTable = context.table('orderItems');
    const childTable = context.table('dryRunItems');
    const viewTable = context.table('viewRows');
    const invalidate = vi.spyOn(context.connection.collections, 'invalidate');

    await context.db.schema.createTable(parentTable, (table) => {
      table.bigInteger('id').primary();
      table.string('name').notNullable();
    });
    await context.db.schema.createTable(childTable, (table) => {
      table.bigInteger('id').primary();
      table
        .bigInteger('parent_id')
        .notNullable()
        .references('id')
        .inTable(parentTable);
    });
    await context.db(parentTable).insert({ id: 1, name: 'parent' });
    await context.db(childTable).insert({ id: 1, parent_id: 1 });
    await context.db.raw(
      `create view ${context.identifier('viewRows')} as select 1 as id`,
    );

    await expect(
      context.connection.collections.get('orderItems'),
    ).resolves.toMatchObject({ name: 'orderItems' });
    await context.connection.resetManagedSchema();

    expect(invalidate).toHaveBeenCalled();
    await expect(context.db.schema.hasTable(parentTable)).resolves.toBe(false);
    await expect(context.db.schema.hasTable(childTable)).resolves.toBe(false);
    await expect(context.db.schema.hasTable(viewTable)).resolves.toBe(false);

    await context.db.schema.createTable(parentTable, (table) => {
      table.bigInteger('id').primary();
    });
    await expect(context.db.schema.hasTable(parentTable)).resolves.toBe(true);
  });
});
