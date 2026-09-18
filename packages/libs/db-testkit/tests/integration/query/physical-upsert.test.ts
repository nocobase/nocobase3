import { upsertPhysicalRow } from '@nocobase/db';
import { expect, it } from 'vitest';

import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('physical row upsert', (context) => {
  async function prepare() {
    await context.builder.createCollection('queryOrders', (collection) => {
      collection.string('id', { primaryKey: true, nullable: false });
      collection.string('title', { nullable: false });
      collection.string('history', { nullable: false });
      collection.string('externalKey', { nullable: false });
      collection.unique(['externalKey']);
    });
  }

  const options = () => ({
    table: context.table('queryOrders'),
    key: { id: 'one' },
    create: {
      title: 'Initial',
      history: 'Preserved',
      external_key: 'external',
    },
    update: { title: 'Updated' },
  });
  const rows = () =>
    context.database.query().selectFrom('queryOrders').selectAll().execute();

  it('uses exact physical names and preserves fields outside the update', async () => {
    await prepare();
    await upsertPhysicalRow(context.database.connection(), options());
    await upsertPhysicalRow(context.database.connection(), options());
    expect(await rows()).toEqual([
      {
        id: 'one',
        title: 'Updated',
        history: 'Preserved',
        externalKey: 'external',
      },
    ]);
  });

  it('serializes concurrent writers for the same unique key', async () => {
    await prepare();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        upsertPhysicalRow(context.database.connection(), options()),
      ),
    );
    expect(await rows()).toEqual([
      {
        id: 'one',
        title: 'Updated',
        history: 'Preserved',
        externalKey: 'external',
      },
    ]);
  });

  it('rolls back with the owning transaction', async () => {
    await prepare();
    await expect(
      context.database.transaction(async (connection) => {
        await upsertPhysicalRow(connection, options());
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows()).toEqual([]);
  });

  it('does not swallow conflicts on another unique key', async () => {
    await prepare();
    await upsertPhysicalRow(context.database.connection(), options());
    await expect(
      upsertPhysicalRow(context.database.connection(), {
        ...options(),
        key: { id: 'two' },
      }),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });

  it('keeps the owning transaction usable after a rejected insert', async () => {
    await prepare();
    await upsertPhysicalRow(context.database.connection(), options());
    await context.database.transaction(async (connection) => {
      await expect(
        upsertPhysicalRow(connection, {
          ...options(),
          key: { id: 'two' },
        }),
      ).rejects.toThrow();
      await upsertPhysicalRow(connection, options());
    });
    expect(await rows()).toMatchObject([{ title: 'Updated' }]);
  });

  it('rejects missing keys and attempts to overwrite key columns', async () => {
    await prepare();
    await expect(
      upsertPhysicalRow(context.database.connection(), {
        ...options(),
        key: {},
      }),
    ).rejects.toThrow('unique key');
    await expect(
      upsertPhysicalRow(context.database.connection(), {
        ...options(),
        update: { id: 'two' },
      }),
    ).rejects.toThrow('key columns');
    expect(await rows()).toEqual([]);
  });
});
