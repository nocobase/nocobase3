import { describe, expect, it } from 'vitest';
import {
  CollectionMetadataConflictError,
  CollectionMetadataValidationError,
  InMemoryCollectionMetadataStore,
} from '../../../src/index.js';

describe('InMemoryCollectionMetadataStore', () => {
  it('validates, clones, creates, updates, and deletes with compare-and-swap', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.initialize();
    const input = {
      version: 1 as const,
      name: 'orders',
      title: 'Orders',
      fields: { amount: { title: 'Amount' } },
    };

    const created = await store.put(input, { expectedRevision: null });
    expect(created.revision).toBe(1);
    input.fields.amount.title = 'Changed input';
    expect((await store.get('orders'))?.document.fields?.amount.title).toBe(
      'Amount',
    );

    created.document.fields!.amount.title = 'Changed returned value';
    const updated = await store.put(
      { version: 1, name: 'orders', title: 'Sales orders' },
      { expectedRevision: created.revision },
    );
    expect(updated).toEqual({
      document: { version: 1, name: 'orders', title: 'Sales orders' },
      revision: 2,
    });

    await expect(
      store.delete('orders', { expectedRevision: created.revision }),
    ).rejects.toMatchObject({
      code: 'METADATA_CONFLICT',
      expectedRevision: 1,
      actualRevision: 2,
    });
    await store.delete('orders', { expectedRevision: updated.revision });
    await expect(store.get('orders')).resolves.toBeUndefined();
  });

  it('rejects stale updates and create-only writes when a document exists', async () => {
    const store = new InMemoryCollectionMetadataStore();
    const created = await store.put(
      { version: 1, name: 'orders' },
      { expectedRevision: null },
    );

    await expect(
      store.put(
        { version: 1, name: 'orders', title: 'Duplicate' },
        { expectedRevision: null },
      ),
    ).rejects.toBeInstanceOf(CollectionMetadataConflictError);
    await expect(
      store.put(
        { version: 1, name: 'orders', title: 'Stale' },
        { expectedRevision: 2 },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_CONFLICT' });
    await expect(store.get('orders')).resolves.toEqual(created);
  });

  it('rejects invalid documents without changing the current revision', async () => {
    const store = new InMemoryCollectionMetadataStore();

    await expect(
      store.put({ version: 1, name: 'orders', nullable: false } as never, {
        expectedRevision: null,
      }),
    ).rejects.toBeInstanceOf(CollectionMetadataValidationError);

    const created = await store.put(
      { version: 1, name: 'orders' },
      { expectedRevision: null },
    );
    expect(created.revision).toBe(1);
  });

  it('lists lightweight summaries in stable paginated name order', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.put(
      { version: 1, name: 'zebra', title: 'Zebra' },
      { expectedRevision: null },
    );
    await store.put(
      {
        version: 1,
        name: 'accounts',
        naming: { tablePrefix: 'app_' },
        description: 'Accounts',
        fields: { id: { title: 'ID' } },
      },
      { expectedRevision: null },
    );

    const first = await store.list({ limit: 1 });
    expect(first.items).toEqual([
      {
        name: 'accounts',
        revision: 2,
        naming: { tablePrefix: 'app_' },
        description: 'Accounts',
      },
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await store.list({ limit: 1, cursor: first.nextCursor });
    expect(second).toEqual({
      items: [{ name: 'zebra', revision: 1, title: 'Zebra' }],
    });
  });

  it('rejects invalid pagination options and cursors', async () => {
    const store = new InMemoryCollectionMetadataStore();

    await expect(store.list({ limit: 0 })).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
    await expect(store.list({ limit: 1001 })).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
    await expect(store.list({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_CURSOR',
    });
    await expect(store.list(null as never)).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
    await expect(store.list({ unknown: true } as never)).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
  });

  it('rejects blind or malformed write options with a stable error', async () => {
    const store = new InMemoryCollectionMetadataStore();

    await expect(
      store.put({ version: 1, name: 'orders' }, undefined as never),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
    await expect(
      store.put(
        { version: 1, name: 'orders' },
        { expectedRevision: Number.NaN },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
    await expect(
      store.delete('orders', { expectedRevision: null } as never),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
    await expect(store.get(' orders')).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
    await expect(
      store.delete('', { expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
  });

  it('declares writable optimistic-concurrency capabilities', () => {
    const store = new InMemoryCollectionMetadataStore();

    expect(store.capabilities).toEqual({
      writable: true,
      optimisticConcurrency: true,
    });
    expect(Object.isFrozen(store.capabilities)).toBe(true);
  });
});
