import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/bulk-returning', (context) => {
  it('returns selected records from bulk mutations in stable order', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.createMany({
        values: [
          { orderNo: 'SO-003', status: 'draft', amount: 30 },
          { orderNo: 'SO-001', status: 'draft', amount: 10 },
          { orderNo: 'SO-002', status: 'paid', amount: 20 },
        ],
        select: (select) => select.fields('id', 'orderNo', 'version'),
      }),
    ).resolves.toEqual({
      createdCount: 3,
      records: [
        { id: 1, orderNo: 'SO-003', version: 1 },
        { id: 2, orderNo: 'SO-001', version: 1 },
        { id: 3, orderNo: 'SO-002', version: 1 },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { status: 'draft' },
        values: { status: 'paid' },
        select: (select) => select.fields('id', 'orderNo', 'status', 'version'),
      }),
    ).resolves.toEqual({
      updatedCount: 2,
      records: [
        { id: 1, orderNo: 'SO-003', status: 'paid', version: 2 },
        { id: 2, orderNo: 'SO-001', status: 'paid', version: 2 },
      ],
    });

    await expect(
      repository.deleteMany({
        all: true,
        select: (select) => select.fields('id', 'orderNo', 'version'),
      }),
    ).resolves.toEqual({
      deletedCount: 3,
      records: [
        { id: 1, orderNo: 'SO-003', version: 2 },
        { id: 2, orderNo: 'SO-001', version: 2 },
        { id: 3, orderNo: 'SO-002', version: 1 },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { status: 'missing' },
        values: { status: 'paid' },
        select: (select) => select.fields('id'),
      }),
    ).resolves.toEqual({ updatedCount: 0, records: [] });
    await expect(
      repository.deleteMany({
        filter: { status: 'missing' },
        select: (select) => select.fields('id'),
      }),
    ).resolves.toEqual({ deletedCount: 0, records: [] });
  });
});
