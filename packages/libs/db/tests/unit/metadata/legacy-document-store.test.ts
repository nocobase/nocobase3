import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryCollectionMetadataStore,
  LegacyCollectionMetadataDocumentStore,
  LegacyCollectionMetadataTransitionError,
} from '../../../src/index.js';

describe('LegacyCollectionMetadataDocumentStore', () => {
  it('exposes extracted V1 documents with stable read-only revisions', async () => {
    const legacy = new InMemoryCollectionMetadataStore();
    await legacy.saveCollection('orders', {
      title: 'Orders',
      fields: [
        { name: 'id', type: 'increments', primaryKey: true },
        { name: 'amount', type: 'decimal', title: 'Amount' },
      ],
    });
    const store = new LegacyCollectionMetadataDocumentStore(legacy);

    const first = await store.get('orders');
    const second = await store.get('orders');

    expect(first).toEqual({
      document: {
        version: 1,
        name: 'orders',
        title: 'Orders',
        fields: { amount: { title: 'Amount' } },
      },
      revision: expect.stringMatching(/^legacy-/),
    });
    expect(second?.revision).toBe(first?.revision);
    expect(store.capabilities).toEqual({
      writable: false,
      optimisticConcurrency: false,
    });
  });

  it('lists extracted summaries using the same pagination contract', async () => {
    const legacy = new InMemoryCollectionMetadataStore();
    await legacy.saveCollection('zebra', { title: 'Zebra' });
    await legacy.saveCollection('accounts', { title: 'Accounts' });
    const store = new LegacyCollectionMetadataDocumentStore(legacy);

    const first = await store.list({ limit: 1 });
    const second = await store.list({
      limit: 1,
      cursor: first.nextCursor,
    });

    expect(first.items[0]).toMatchObject({ name: 'accounts' });
    expect(second.items[0]).toMatchObject({ name: 'zebra' });
  });

  it('reports warnings and blocks unsafe legacy transitions', async () => {
    const legacy = new InMemoryCollectionMetadataStore();
    await legacy.saveCollection('orders', {
      fields: [
        {
          name: 'amount',
          type: 'decimal',
          title: 'Amount',
        },
      ],
    });
    const stored = await legacy.getCollection('orders');
    Object.assign(stored!.fields![0], { interface: 'number' });
    await legacy.saveCollection('orders', stored!);
    const onDiagnostic = vi.fn();
    const store = new LegacyCollectionMetadataDocumentStore(legacy, {
      onDiagnostic,
    });

    await expect(store.get('orders')).resolves.toBeDefined();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' }),
    );

    await legacy.saveCollection('orders', {
      fields: [{ name: 'label', type: 'virtual' }],
    });
    await expect(store.get('orders')).rejects.toBeInstanceOf(
      LegacyCollectionMetadataTransitionError,
    );
  });

  it('rejects writes without mutating the legacy Store', async () => {
    const legacy = new InMemoryCollectionMetadataStore();
    await legacy.saveCollection('orders', { title: 'Orders' });
    const store = new LegacyCollectionMetadataDocumentStore(legacy);

    await expect(
      store.put(
        { version: 1, name: 'orders', title: 'Changed' },
        { expectedRevision: null },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_READ_ONLY' });
    await expect(
      store.delete('orders', { expectedRevision: 'legacy-revision' }),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_READ_ONLY' });
    await expect(legacy.getCollection('orders')).resolves.toMatchObject({
      title: 'Orders',
    });
  });
});
