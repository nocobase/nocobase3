import { expect, it } from 'vitest';
import { DatabaseCollectionMetadataStore } from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases(
  'Database Collection Metadata Store',
  (context) => {
    it('persists documents and enforces compare-and-swap revisions', async () => {
      const tableName = context.identifier('collectionMetadata');
      const store = new DatabaseCollectionMetadataStore({
        resolveClient: async () => context.db,
        tableName,
      });

      await Promise.all([store.initialize(), store.initialize()]);
      expect(await context.db.schema.hasTable(tableName)).toBe(true);
      expect(store.capabilities).toEqual({
        writable: true,
        optimisticConcurrency: true,
      });

      const created = await store.put(
        { version: 1, name: 'orders', title: 'Orders' },
        { expectedRevision: null },
      );
      expect(created.revision).toBe(1);

      const updated = await store.put(
        {
          version: 1,
          name: 'orders',
          title: 'Sales orders',
          fields: { amount: { title: 'Order amount' } },
        },
        { expectedRevision: created.revision },
      );
      expect(updated.revision).toBe(2);

      await expect(
        store.put(
          { version: 1, name: 'orders', title: 'Stale update' },
          { expectedRevision: created.revision },
        ),
      ).rejects.toMatchObject({
        code: 'METADATA_CONFLICT',
        collection: 'orders',
        expectedRevision: 1,
        actualRevision: 2,
      });
      await expect(store.get('orders')).resolves.toEqual(updated);

      const reloaded = new DatabaseCollectionMetadataStore({
        resolveClient: async () => context.db,
        tableName,
      });
      await expect(reloaded.get('orders')).resolves.toEqual(updated);

      await expect(
        store.delete('orders', { expectedRevision: created.revision }),
      ).rejects.toMatchObject({
        code: 'METADATA_CONFLICT',
        actualRevision: 2,
      });
      await store.delete('orders', { expectedRevision: updated.revision });
      await expect(store.get('orders')).resolves.toBeUndefined();
    });

    it('returns stable name-ordered pages from the database', async () => {
      const store = new DatabaseCollectionMetadataStore({
        resolveClient: async () => context.db,
        tableName: context.identifier('paginatedCollectionMetadata'),
      });

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
        },
        { expectedRevision: null },
      );

      const first = await store.list({ limit: 1 });
      expect(first.items).toEqual([
        {
          name: 'accounts',
          revision: 1,
          naming: { tablePrefix: 'app_' },
          description: 'Accounts',
        },
      ]);
      expect(first.nextCursor).toEqual(expect.any(String));
      await expect(
        store.list({ limit: 1, cursor: first.nextCursor }),
      ).resolves.toEqual({
        items: [{ name: 'zebra', revision: 1, title: 'Zebra' }],
      });
    });
  },
);
