import { describe, expect, it } from 'vitest';
import { InMemoryCollectionMetadataStore } from '../src/metadata.js';

describe('InMemoryCollectionMetadataStore', () => {
  it('clones saved and returned collection definitions', async () => {
    const store = new InMemoryCollectionMetadataStore();
    const definition = {
      title: 'Orders',
      fields: [
        { name: 'status', type: 'string' },
      ],
    };

    await store.saveCollection('orders', definition);
    definition.fields[0].type = 'text';

    const saved = await store.getCollection('orders');
    expect(saved).toMatchObject({
      name: 'orders',
      fields: [{ name: 'status', type: 'string' }],
    });

    saved!.fields![0].type = 'text';
    await expect(store.getCollection('orders')).resolves.toMatchObject({
      fields: [{ name: 'status', type: 'string' }],
    });
  });

  it('renames, removes, and ignores missing collections', async () => {
    const store = new InMemoryCollectionMetadataStore();

    await store.renameCollection('missing', 'renamed');
    expect(await store.getCollection('renamed')).toBeUndefined();

    await store.saveCollection('orders', {
      fields: [{ name: 'id', type: 'increments' }],
    });
    await store.renameCollection('orders', 'salesOrders');
    expect(await store.getCollection('orders')).toBeUndefined();
    expect(await store.getCollection('salesOrders')).toMatchObject({
      name: 'salesOrders',
    });

    await store.removeCollection('salesOrders');
    expect(await store.getCollection('salesOrders')).toBeUndefined();
  });
});
