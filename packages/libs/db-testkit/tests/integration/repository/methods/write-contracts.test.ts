import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders, selection, sorting } from '../fixtures/scalar.js';

describeIntegrationDatabases(
  'Repository methods/write-contracts',
  (context) => {
    it('runs scalar mutations with logical unique selectors and optimistic locking', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');

      const created = await repository.createOne({
        values: { orderNo: 'SO-001', status: 'draft', amount: 50 },
        select: selection(['id', 'orderNo']),
      });
      expect(created).toMatchObject({
        record: { id: expect.any(Number), orderNo: 'SO-001' },
        createdTargets: [],
        version: 1,
      });
      const id = created.record.id;

      const updated = await repository.updateOne({
        filter: { id: id as number },
        ifVersion: 1,
        values: { status: 'paid' },
        select: selection(['orderNo', 'status']),
      });
      expect(updated).toEqual({
        record: { orderNo: 'SO-001', status: 'paid' },
        createdTargets: [],
        version: 2,
      });
      await expect(
        repository.updateOne({
          filter: (filter) => filter.number('id').eq(id as number),
          ifVersion: 1,
          values: { status: 'stale' },
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

      await repository.createMany({
        values: [
          { orderNo: 'SO-002', status: 'draft', amount: 100 },
          { orderNo: 'SO-003', status: 'draft', amount: 200 },
        ],
      });
      await expect(
        repository.updateMany({
          filter: { status: 'draft' },
          values: { status: 'cancelled' },
        }),
      ).resolves.toEqual({ updatedCount: 2 });
      await expect(
        repository.findMany({
          select: selection(['version']),
          filter: (filter) => filter.string('status').eq('cancelled'),
          sort: sorting('id', 'asc'),
        }),
      ).resolves.toEqual([{ version: 2 }, { version: 2 }]);
      await expect(
        repository.deleteMany({
          filter: { status: 'cancelled' },
        }),
      ).resolves.toEqual({ deletedCount: 2 });

      await expect(
        repository.deleteOne({
          filter: { id: id as number },
          ifVersion: 2,
          select: (select) => select.fields('orderNo', 'status', 'version'),
        }),
      ).resolves.toEqual({
        deleted: true,
        record: {
          orderNo: 'SO-001',
          status: 'paid',
          version: 2,
        },
      });
      await expect(repository.count()).resolves.toBe(0);
    });

    it('enforces exact cardinality for filter-based single mutations', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');
      await repository.createMany({
        values: [
          { orderNo: 'SO-001', status: 'draft', amount: 50 },
          { orderNo: 'SO-002', status: 'draft', amount: 100 },
          { orderNo: 'SO-003', status: 'paid', amount: 200 },
        ],
      });

      await expect(
        repository.updateOne({
          filter: (filter) =>
            filter.string('orderNo').eq(filter.variable('$orderNo')),
          context: { orderNo: 'SO-003' },
          ifVersion: 1,
          values: { amount: 250 },
          select: selection(['orderNo', 'amount']),
        }),
      ).resolves.toEqual({
        record: { orderNo: 'SO-003', amount: 250 },
        createdTargets: [],
        version: 2,
      });

      await expect(
        repository.updateOne({
          filter: { status: 'draft' },
          values: { status: 'cancelled' },
        }),
      ).rejects.toMatchObject({ code: 'MULTIPLE_RECORDS_MATCHED' });
      await expect(
        repository.count({
          filter: (filter) => filter.string('status').eq('draft'),
        }),
      ).resolves.toBe(2);

      await expect(
        repository.updateOne({
          filter: (filter) => filter.string('orderNo').eq('missing'),
          values: { amount: 0 },
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
      await expect(
        repository.updateOne({
          filter: (filter) => filter.string('orderNo').eq('SO-003'),
          ifVersion: 1,
          values: { amount: 0 },
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

      await expect(
        repository.deleteOne({
          filter: { status: 'draft' },
        }),
      ).rejects.toMatchObject({ code: 'MULTIPLE_RECORDS_MATCHED' });
      await expect(
        repository.deleteOne({
          filter: (filter) => filter.string('orderNo').eq('SO-001'),
          select: selection(['missing']),
        }),
      ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
      await expect(
        repository.exists({ filter: { orderNo: 'SO-001' } }),
      ).resolves.toBe(true);
      await expect(
        repository.deleteOne({
          filter: (filter) => filter.string('orderNo').eq('SO-001'),
          ifVersion: 1,
        }),
      ).resolves.toEqual({ deleted: true });
      await expect(
        repository.deleteOne({
          filter: (filter) => filter.string('orderNo').eq('missing'),
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    });
  },
);
