import { describe, expect, it } from 'vitest';
import {
  CollectionBuilder,
  CollectionRenameDependencyError,
  InMemoryCollectionMetadataStore,
} from '../../../src/index.js';

describe('CollectionBuilder renameCollection', () => {
  it('renames the physical table and metadata by deterministic naming', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({
      metadataStore,
      naming: { tablePrefix: 'tbl_' },
    });
    await builder.createCollection('orderItems', {
      title: 'Order items',
      fields: [{ name: 'id', type: 'increments', primaryKey: true }],
    });

    const result = await builder.renameCollection('orderItems', 'orderLines');

    expect(result.operations).toEqual([
      { type: 'renameCollection', from: 'orderItems', to: 'orderLines' },
    ]);
    expect(result.schemaOperations).toEqual([
      {
        type: 'renameTable',
        from: 'tbl_order_items',
        to: 'tbl_order_lines',
      },
    ]);
    expect(await metadataStore.getCollection('orderItems')).toBeUndefined();
    expect(await metadataStore.getCollection('orderLines')).toMatchObject({
      name: 'orderLines',
      title: 'Order items',
    });
  });

  it('keeps collection naming while renaming the table', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });
    await builder.createCollection('auditLogs', (collection) => {
      collection.naming({ tablePrefix: 'archive_' });
      collection.increments('id');
    });

    const result = await builder.renameCollection('auditLogs', 'eventLogs');

    expect(result.schemaOperations).toEqual([
      {
        type: 'renameTable',
        from: 'archive_audit_logs',
        to: 'archive_event_logs',
      },
    ]);
    expect(await metadataStore.getCollection('eventLogs')).toMatchObject({
      naming: { tablePrefix: 'archive_' },
    });
  });

  it('uses the configured underscored option when renaming the table', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({
      metadataStore,
      naming: { underscored: false, tablePrefix: 'tbl_' },
    });
    await builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
    });

    const result = await builder.renameCollection('orderItems', 'orderLines');

    expect(result.schemaOperations).toEqual([
      {
        type: 'renameTable',
        from: 'tbl_orderItems',
        to: 'tbl_orderLines',
      },
    ]);
  });

  it('rejects rename when collection metadata has dependents', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
    });
    await builder.createCollection('orderItems', (collection) => {
      collection.increments('id');
      collection.belongsTo('order', 'orders');
    });

    const promise = builder.renameCollection('orders', 'salesOrders');
    await expect(promise).rejects.toBeInstanceOf(
      CollectionRenameDependencyError,
    );
    await expect(promise).rejects.toMatchObject({
      code: 'COLLECTION_RENAME_HAS_DEPENDENCIES',
      dependencies: [
        {
          collection: 'orderItems',
          kind: 'relationTarget',
          path: 'fields.order.target',
        },
      ],
    });
    expect(await metadataStore.getCollection('orders')).toBeDefined();
    expect(await metadataStore.getCollection('salesOrders')).toBeUndefined();
  });

  it('rejects rename when a raw view exists because its dependencies are opaque', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const builder = new CollectionBuilder({ metadataStore });
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
    });
    await builder.createViewCollection('orderReport', (view) => {
      view.integer('id');
      view.asRaw('select id from orders');
    });

    await expect(
      builder.renameCollection('orders', 'salesOrders'),
    ).rejects.toMatchObject({
      dependencies: [
        {
          collection: 'orderReport',
          kind: 'rawView',
          path: 'view.asRaw',
        },
      ],
    });
  });
});
