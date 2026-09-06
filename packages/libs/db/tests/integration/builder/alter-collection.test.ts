import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  expectUniqueViolation,
  listIndexes,
} from '../helpers.js';

describeIntegrationDatabases('collection alteration', (context) => {
  it('adds and drops fields on an existing collection', async () => {
    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('name');
    });

    await context.builder.alterCollection('users', (collection) => {
      collection.string('firstName');
      collection.string('lastName');
      collection.dropField('name');
    });

    expect(
      await context.db.schema.hasColumn(context.table('users'), 'name'),
    ).toBe(false);
    expect(
      await context.db.schema.hasColumn(context.table('users'), 'first_name'),
    ).toBe(true);
    expect(
      await context.db.schema.hasColumn(context.table('users'), 'last_name'),
    ).toBe(true);
  });

  it('uses field, index, and constraint shortcut APIs', async () => {
    const paidAtIndexName = context.identifier('idx_orders_paid_at');
    const paidAtUniqueName = context.identifier('uk_orders_paid_at');

    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.decimal('amount', { precision: 12, scale: 2 });
    });

    await context.builder.addField('orders', {
      name: 'paidAt',
      type: 'datetime',
      nullable: true,
    });
    await context.builder.addIndex('orders', {
      fields: ['paidAt'],
      name: paidAtIndexName,
    });
    await context.builder.addConstraint('orders', {
      type: 'unique',
      fields: ['paidAt'],
      name: paidAtUniqueName,
    });

    expect(
      await context.db.schema.hasColumn(context.table('orders'), 'paid_at'),
    ).toBe(true);
    const indexes = await listIndexes(context, context.table('orders'));
    if (context.spec.dialect === 'oracle') {
      expect(indexes.map((index) => index.name)).toContain(paidAtIndexName);
      const inspected = await context.database
        .connection()
        .schemaInspector.getPhysicalCollection({
          tableName: context.table('orders'),
        });
      expect(inspected?.uniqueConstraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: paidAtUniqueName }),
        ]),
      );
    } else {
      expect(indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([paidAtIndexName, paidAtUniqueName]),
      );
    }

    await context
      .db(context.table('orders'))
      .insert({ amount: 1, paid_at: '2026-08-13 10:00:00' });
    await expectUniqueViolation(
      context
        .db(context.table('orders'))
        .insert({ amount: 2, paid_at: '2026-08-13 10:00:00' }),
    );

    await context.builder.dropIndex('orders', paidAtIndexName);
    const remainingIndexNames = (
      await listIndexes(context, context.table('orders'))
    ).map((index) => index.name);
    if (context.spec.dialect === 'oracle') {
      // Oracle can reuse an existing index to enforce a later unique
      // constraint. The logical index is removed from metadata, while the
      // physical index must remain until the constraint is dropped.
      expect(remainingIndexNames).toContain(paidAtIndexName);
    } else {
      expect(remainingIndexNames).not.toContain(paidAtIndexName);
    }
  });
});
