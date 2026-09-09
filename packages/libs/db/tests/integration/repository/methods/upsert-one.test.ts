import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository methods/upsert-one', (context) => {
  it('upserts one record by a unique filter', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.upsertOne({
        filter: { orderNo: 'SO-001' },
        create: { orderNo: 'SO-001', status: 'draft', amount: 50 },
        update: { amount: 75 },
        select: (select) =>
          select.fields('id', 'orderNo', 'status', 'amount', 'version'),
      }),
    ).resolves.toMatchObject({
      record: {
        id: expect.any(Number),
        orderNo: 'SO-001',
        status: 'draft',
        amount: 50,
        version: 1,
      },
      createdTargets: [],
      version: 1,
    });

    await expect(
      repository.upsertOne({
        filter: { orderNo: 'SO-001' },
        create: { orderNo: 'SO-001', status: 'ignored', amount: 0 },
        update: { status: 'paid', amount: 75 },
        ifVersion: 1,
        select: (select) =>
          select.fields('orderNo', 'status', 'amount', 'version'),
      }),
    ).resolves.toEqual({
      record: {
        orderNo: 'SO-001',
        status: 'paid',
        amount: 75,
        version: 2,
      },
      createdTargets: [],
      version: 2,
    });

    await expect(
      repository.upsertOne({
        filter: { orderNo: 'SO-001' },
        create: { orderNo: 'SO-001', status: 'ignored', amount: 0 },
        update: { amount: 100 },
        ifVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    await expect(
      repository.upsertOne({
        filter: { status: 'missing' },
        create: { orderNo: 'SO-002', status: 'missing', amount: 0 },
        update: { amount: 100 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });

    await expect(
      repository.upsertOne({
        filter: { orderNo: 'SO-002' },
        create: { orderNo: 'different', status: 'draft', amount: 0 },
        update: { amount: 100 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION', path: ['create'] });

    await expect(
      repository.upsertOne({
        filter: { orderNo: 'SO-001' },
        create: { orderNo: 'SO-001', status: 'ignored', amount: 0 },
        update: { orderNo: 'SO-002' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION', path: ['update'] });
  });
});
