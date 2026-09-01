import { describe, expect, it } from 'vitest';
import {
  CollectionMetadataValidationError,
  ModuleCollectionMetadataDocumentStore,
} from '../../../src/index.js';

describe('ModuleCollectionMetadataDocumentStore', () => {
  it('validates documents and exposes stable content revisions', async () => {
    const input = {
      version: 1 as const,
      name: 'orders',
      title: 'Orders',
      fields: { amount: { title: 'Amount' } },
    };
    const first = new ModuleCollectionMetadataDocumentStore({
      documents: [input],
      source: 'metadata/orders.ts',
    });
    const second = new ModuleCollectionMetadataDocumentStore({
      documents: [structuredClone(input)],
    });

    const stored = await first.get('orders');
    const same = await second.get('orders');

    expect(stored).toEqual({
      document: input,
      revision: expect.stringMatching(/^sha256-/),
    });
    expect(same?.revision).toBe(stored?.revision);
    input.fields.amount.title = 'Changed input';
    expect((await first.get('orders'))?.document.fields?.amount.title).toBe(
      'Amount',
    );

    const reordered = new ModuleCollectionMetadataDocumentStore({
      documents: [
        {
          fields: { amount: { title: 'Amount' } },
          title: 'Orders',
          name: 'orders',
          version: 1,
        },
      ],
    });
    expect((await reordered.get('orders'))?.revision).toBe(stored?.revision);
  });

  it('rejects invalid and duplicate documents atomically', async () => {
    const invalid = new ModuleCollectionMetadataDocumentStore({
      documents: [{ version: 2, name: 'orders' }],
    });
    await expect(invalid.initialize()).rejects.toBeInstanceOf(
      CollectionMetadataValidationError,
    );

    const duplicate = new ModuleCollectionMetadataDocumentStore({
      documents: [
        { version: 1, name: 'orders' },
        { version: 1, name: 'orders', title: 'Duplicate' },
      ],
    });
    await expect(duplicate.initialize()).rejects.toMatchObject({
      code: 'METADATA_STORE_INVALID_OPTIONS',
    });
  });

  it('lists summaries and points read-only errors at the source file', async () => {
    const store = new ModuleCollectionMetadataDocumentStore({
      documents: [
        { version: 1, name: 'zebra', title: 'Zebra' },
        { version: 1, name: 'accounts', title: 'Accounts' },
      ],
      source: 'src/collection-metadata.ts',
    });

    const first = await store.list({ limit: 1 });
    expect(first.items[0]?.name).toBe('accounts');
    expect(
      (await store.list({ cursor: first.nextCursor })).items[0]?.name,
    ).toBe('zebra');
    await expect(
      store.put({ version: 1, name: 'orders' }, { expectedRevision: null }),
    ).rejects.toMatchObject({
      code: 'METADATA_STORE_READ_ONLY',
      source: 'src/collection-metadata.ts',
    });
  });
});
