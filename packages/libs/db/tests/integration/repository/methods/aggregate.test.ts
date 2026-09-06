import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/aggregate', (context) => {
  it('aggregates filtered scalar fields with stable empty-set semantics', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'SO-001', status: 'draft', amount: 50, note: null },
        { orderNo: 'SO-002', status: 'paid', amount: 120, note: 'ready' },
        { orderNo: 'SO-003', status: 'paid', amount: 240, note: null },
      ],
    });

    const aggregate = await repository.aggregate({
      filter: { status: 'paid' },
      aggregate: (aggregate) => ({
        count: aggregate.count(),
        notedCount: aggregate.count('note'),
        totalAmount: aggregate.sum('amount'),
        averageAmount: aggregate.avg('amount'),
        minimumAmount: aggregate.min('amount'),
        maximumAmount: aggregate.max('amount'),
      }),
    });
    expect({
      ...aggregate,
      totalAmount: Number(aggregate.totalAmount),
      averageAmount: Number(aggregate.averageAmount),
    }).toEqual({
      count: 2,
      notedCount: 1,
      totalAmount: 360,
      averageAmount: 180,
      minimumAmount: 120,
      maximumAmount: 240,
    });

    await expect(
      repository.aggregate({
        filter: { status: 'missing' },
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [
            { kind: 'count', alias: 'count' },
            { kind: 'sum', alias: 'totalAmount', field: 'amount' },
            { kind: 'avg', alias: 'averageAmount', field: 'amount' },
            { kind: 'min', alias: 'minimumAmount', field: 'amount' },
            { kind: 'max', alias: 'maximumAmount', field: 'amount' },
          ],
        },
      }),
    ).resolves.toEqual({
      count: 0,
      totalAmount: null,
      averageAmount: null,
      minimumAmount: null,
      maximumAmount: null,
    });
  });

  it('validates aggregate selections before execution', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.aggregate({
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AGGREGATE' });
    await expect(
      repository.aggregate({
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'sum', alias: 'invalid', field: 'status' }],
        },
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
      field: 'status',
    });
  });
});
