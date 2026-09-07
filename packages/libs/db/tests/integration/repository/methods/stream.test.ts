import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/stream', (context) => {
  it('streams selected root records and releases an interrupted stream', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'SO-001', status: 'draft', amount: 50 },
        { orderNo: 'SO-002', status: 'paid', amount: 120 },
        { orderNo: 'SO-003', status: 'paid', amount: 240 },
      ],
    });

    const records: Array<{ id: unknown; orderNo: unknown }> = [];
    for await (const record of repository.findMany({
      filter: { status: 'paid' },
      sort: (sort) => sort.field('id').asc(),
      select: (select) => select.fields('id', 'orderNo'),
    })) {
      records.push(record as { id: unknown; orderNo: unknown });
    }
    expect(records).toEqual([
      { id: 2, orderNo: 'SO-002' },
      { id: 3, orderNo: 'SO-003' },
    ]);

    for await (const record of repository.findMany({
      sort: (sort) => sort.field('id').asc(),
      select: (select) => select.fields('id'),
    })) {
      expect(record).toEqual({ id: 1 });
      break;
    }
    await expect(repository.count()).resolves.toBe(3);
  });
});
