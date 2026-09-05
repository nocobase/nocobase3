import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Repository explicit identity', (context) => {
  it('writes using a string unique key without a primary key or an id field', async () => {
    await context.builder.createCollection('accounts', (collection) => {
      collection.string('account').notNull().unique();
      collection.string('name').notNull();
    });
    const accounts = context.database.repository('accounts');
    expect(
      (await accounts.createOne({ values: { account: 'A', name: 'First' } }))
        .record,
    ).toEqual({ account: 'A', name: 'First' });
    expect(
      (
        await accounts.updateOne({
          filter: { account: 'A' },
          values: { name: 'Changed' },
        })
      ).record.name,
    ).toBe('Changed');
    expect(
      await accounts.findMany({
        sort: (sort) => sort.field('account').asc(),
        cursor: { account: '0' },
      }),
    ).toHaveLength(1);
    expect(await accounts.deleteOne({ filter: { account: 'A' } })).toEqual({
      deleted: true,
    });
  });

  it('preserves string id values through create, update and delete', async () => {
    await context.builder.createCollection('stringIds', (collection) => {
      collection.string('id').primary().notNull();
      collection.string('name').notNull();
    });
    const records = context.database.repository('stringIds');
    expect(
      (await records.createOne({ values: { id: 'external-A', name: 'A' } }))
        .record.id,
    ).toBe('external-A');
    expect(
      (
        await records.updateOne({
          filter: { id: 'external-A' },
          values: { name: 'B' },
        })
      ).record.id,
    ).toBe('external-A');
    await records.deleteOne({ filter: { id: 'external-A' } });
    expect(await records.count()).toBe(0);
  });

  it('supports collection operations on records without any unique key', async () => {
    await context.builder.createCollection('events', (collection) => {
      collection.string('id');
      collection.string('message');
    });
    const events = context.database.repository('events');
    expect(
      await events.createMany({
        values: [
          { id: 'duplicate', message: 'A' },
          { id: 'duplicate', message: 'A' },
        ],
      }),
    ).toEqual({ createdCount: 2 });
    expect(await events.count()).toBe(2);
    expect(
      await events.updateMany({
        filter: { id: 'duplicate' },
        values: { message: 'B' },
      }),
    ).toEqual({ updatedCount: 2 });
    expect(await events.deleteMany({ filter: { message: 'B' } })).toEqual({
      deletedCount: 2,
    });
  });
});
