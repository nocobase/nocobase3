import { describe, expect, it } from 'vitest';
import {
  InMemoryCollectionMetadataStore,
  ModuleCollectionMetadataStore,
  TransactionCollectionMetadataStore,
} from '../../../src/index.js';

describe('TransactionCollectionMetadataStore', () => {
  it('isolates writes until commit and preserves compare-and-swap', async () => {
    const base = new InMemoryCollectionMetadataStore();
    const transaction = new TransactionCollectionMetadataStore(base);

    const created = await transaction.put(
      { version: 1, name: 'orders', title: 'Orders' },
      { expectedRevision: null },
    );
    expect(created.revision).toMatch(/^transaction-/);
    await expect(base.get('orders')).resolves.toBeUndefined();
    await expect(
      transaction.put(
        { version: 1, name: 'orders', title: 'Conflict' },
        { expectedRevision: null },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_CONFLICT' });

    await transaction.commit();
    await expect(base.get('orders')).resolves.toMatchObject({
      document: { title: 'Orders' },
      revision: 1,
    });
  });

  it('discards uncommitted state and can compensate a committed overlay', async () => {
    const base = new InMemoryCollectionMetadataStore();
    const original = await base.put(
      { version: 1, name: 'orders', title: 'Original' },
      { expectedRevision: null },
    );
    const abandoned = new TransactionCollectionMetadataStore(base);
    await abandoned.delete('orders', { expectedRevision: original.revision });
    await expect(base.get('orders')).resolves.toEqual(original);

    const transaction = new TransactionCollectionMetadataStore(base);
    await transaction.put(
      { version: 1, name: 'orders', title: 'Changed' },
      { expectedRevision: original.revision },
    );
    await transaction.commit();
    await expect(base.get('orders')).resolves.toMatchObject({
      document: { title: 'Changed' },
    });
    await transaction.rollbackCommitted();
    await expect(base.get('orders')).resolves.toMatchObject({
      document: { title: 'Original' },
    });
  });

  it('preserves read-only backend capabilities', async () => {
    const transaction = new TransactionCollectionMetadataStore(
      new ModuleCollectionMetadataStore({ documents: [] }),
    );

    await expect(
      transaction.put(
        { version: 1, name: 'orders', title: 'Orders' },
        { expectedRevision: null },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_READ_ONLY' });
  });
});
