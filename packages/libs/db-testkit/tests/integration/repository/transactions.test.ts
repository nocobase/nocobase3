import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { createOrders } from './fixtures/scalar.js';

describeIntegrationDatabases('Repository transactions', (context) => {
  it('validates Collection Field capabilities and preserves transaction binding', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.findMany({
        filter: (filter) => filter.number('status').eq(1),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    await expect(
      repository.createOne({
        values: { orderNo: 'SO-001', status: 'draft', amount: 1, version: 9 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE' });
    await expect(
      repository.updateOne({
        filter: (filter) => filter.string('missing').eq('draft'),
        values: { amount: 2 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });

    await expect(
      context.database.transaction(async (connection) => {
        await connection.repository('repositoryOrders').createOne({
          values: { orderNo: 'ROLLBACK', status: 'draft', amount: 1 },
        });
        throw new Error('rollback');
      }, context.spec.name),
    ).rejects.toThrow('rollback');
    await expect(
      repository.exists({
        filter: (filter) => filter.string('orderNo').eq('ROLLBACK'),
      }),
    ).resolves.toBe(false);
  });
});
