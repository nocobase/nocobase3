import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders, selection, sorting } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/read-contracts', (context) => {
  it('runs Collection-aware reads, filters, sorts, variables, and pagination', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'SO-001', status: 'draft', amount: 50, note: '' },
        { orderNo: 'SO-002', status: 'paid', amount: 120, note: null },
        { orderNo: 'SO-003', status: 'paid', amount: 240, note: 'priority' },
      ],
    });

    await expect(
      repository.findMany({
        select: selection(['orderNo', 'amount']),
        context: { minimum: 100 },
        filter: (filter) =>
          filter.and([
            filter.string('status').eq('paid'),
            filter.number('amount').gte(filter.variable('$minimum')),
          ]),
        sort: sorting('amount', 'desc'),
        limit: 1,
      }),
    ).resolves.toEqual([{ orderNo: 'SO-003', amount: 240 }]);
    await expect(
      repository.count({
        filter: (filter) => filter.string('note').empty(),
      }),
    ).resolves.toBe(2);
    await expect(
      repository.exists({
        filter: (filter) => filter.string('note').includes('prior'),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.findOne({
        filter: (filter) => filter.string('orderNo').eq('SO-002'),
      }),
    ).resolves.toMatchObject({ orderNo: 'SO-002', status: 'paid' });
    await expect(
      repository.findOne({
        select: (select) => select.fields('orderNo', 'amount'),
        sort: (sort) => sort.field('amount').desc(),
      }),
    ).resolves.toEqual({ orderNo: 'SO-003', amount: 240 });
  });
});
