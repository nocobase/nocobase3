import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases(
  'Collection Metadata Service updates',
  (context) => {
    it('updates metadata without changing database schema', async () => {
      await context.builder.createCollection('orders', (collection) => {
        collection.increments('id');
        collection.decimal('amount', { precision: 12, scale: 2 });
      });

      const connection = context.database.connection(context.spec.name);
      await connection.collectionMetadata.updateCollection('orders', {
        title: 'Orders',
        description: 'Customer purchase orders.',
      });
      await connection.collectionMetadata.updateField('orders', 'amount', {
        title: 'Amount',
        description: 'Total order amount before refunds.',
      });

      expect(
        await context.db.schema.hasColumn(context.table('orders'), 'title'),
      ).toBe(false);

      const stored = await context.metadataStore.get('orders');
      expect(stored?.document).toEqual({
        version: 1,
        name: 'orders',
        title: 'Orders',
        description: 'Customer purchase orders.',
        fields: {
          amount: {
            title: 'Amount',
            description: 'Total order amount before refunds.',
          },
        },
      });
    });
  },
);
