import { expect, it } from 'vitest';
import { DatabaseCollectionMetadataStore } from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases(
  'Database Collection Metadata Store transactions',
  (context) => {
    it('commits and rolls back Metadata DML with the supplied transaction client', async () => {
      const store = new DatabaseCollectionMetadataStore({
        resolveClient: async () => context.db,
        tableName: context.identifier('transactionCollectionMetadata'),
      });
      await store.initialize();

      class ExpectedRollback extends Error {}

      await expect(
        context.db.transaction(async (transaction) => {
          const transactionalStore = store.withClient(async () => transaction);
          await transactionalStore.put(
            { version: 1, name: 'rolledBack', title: 'Rolled back' },
            { expectedRevision: null },
          );
          await expect(
            transactionalStore.get('rolledBack'),
          ).resolves.toMatchObject({
            revision: 1,
            document: { name: 'rolledBack', title: 'Rolled back' },
          });
          throw new ExpectedRollback();
        }),
      ).rejects.toBeInstanceOf(ExpectedRollback);
      await expect(store.get('rolledBack')).resolves.toBeUndefined();

      await context.db.transaction(async (transaction) => {
        const transactionalStore = store.withClient(async () => transaction);
        await transactionalStore.put(
          { version: 1, name: 'committed', title: 'Committed' },
          { expectedRevision: null },
        );
      });
      await expect(store.get('committed')).resolves.toMatchObject({
        revision: 1,
        document: { name: 'committed', title: 'Committed' },
      });
    });
  },
);
