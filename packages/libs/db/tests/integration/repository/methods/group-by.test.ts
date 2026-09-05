import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/group-by', (context) => {
  it('groups filtered records and filters or sorts aggregate aliases', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'SO-001', status: 'draft', amount: 50 },
        { orderNo: 'SO-002', status: 'paid', amount: 120 },
        { orderNo: 'SO-003', status: 'paid', amount: 240 },
        { orderNo: 'SO-004', status: 'draft', amount: 70 },
        { orderNo: 'SO-005', status: 'cancelled', amount: 10 },
      ],
    });

    await expect(
      repository.groupBy({
        by: ['status'],
        filter: (filter) => filter.string('status').ne('cancelled'),
        aggregate: (aggregate) => ({
          count: aggregate.count(),
          totalAmount: aggregate.sum('amount'),
          maximumAmount: aggregate.max('amount'),
        }),
        having: (filter) => filter.number('count').gte(2),
        sort: (sort) => sort.field('totalAmount').desc(),
      }),
    ).resolves.toEqual([
      { status: 'paid', count: 2, totalAmount: 360, maximumAmount: 240 },
      { status: 'draft', count: 2, totalAmount: 120, maximumAmount: 70 },
    ]);

    await expect(
      repository.groupBy({
        by: ['status'],
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'count', alias: 'count' }],
        },
      }),
    ).resolves.toEqual([
      { status: 'cancelled', count: 1 },
      { status: 'draft', count: 2 },
      { status: 'paid', count: 2 },
    ]);
  });

  it('validates group fields, aliases, having, and sort before execution', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.groupBy({
        by: [] as never,
        aggregate: (aggregate) => ({ count: aggregate.count() }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GROUP_BY', path: ['by'] });
    await expect(
      repository.groupBy({
        by: ['status'],
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'count', alias: 'status' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GROUP_BY' });
    await expect(
      repository.groupBy({
        by: ['status'],
        aggregate: (aggregate) => ({ count: aggregate.count() }),
        having: { missing: 1 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
  });
});
