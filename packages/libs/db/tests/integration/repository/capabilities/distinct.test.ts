import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository capabilities/distinct', (context) => {
  it('selects one complete record per distinct Field tuple before pagination', async () => {
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
      repository.findMany({
        distinct: ['status'],
        sort: (sort) => [sort.field('amount').desc(), sort.field('id').asc()],
        select: (select) => select.fields('orderNo', 'status', 'amount'),
        limit: 2,
      }),
    ).resolves.toEqual([
      { orderNo: 'SO-003', status: 'paid', amount: 240 },
      { orderNo: 'SO-004', status: 'draft', amount: 70 },
    ]);

    await expect(
      repository.findMany({
        distinct: ['status', 'enabled'],
        select: (select) => select.fields('orderNo', 'status'),
      }),
    ).resolves.toEqual([
      { orderNo: 'SO-001', status: 'draft' },
      { orderNo: 'SO-002', status: 'paid' },
      { orderNo: 'SO-005', status: 'cancelled' },
    ]);
  });

  it('validates distinct Fields and stable direct sort', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.findMany({ distinct: [] as never }),
    ).rejects.toMatchObject({ code: 'INVALID_DISTINCT' });
    await expect(
      repository.findMany({ distinct: ['missing' as never] }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
  });
});
