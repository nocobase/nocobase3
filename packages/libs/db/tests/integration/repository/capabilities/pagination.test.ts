import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases(
  'Repository capabilities/pagination',
  (context) => {
    it('paginates after an exclusive multi-Field cursor boundary', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');
      await repository.createMany({
        values: [
          { orderNo: 'SO-001', status: 'paid', amount: 50 },
          { orderNo: 'SO-002', status: 'paid', amount: 120 },
          { orderNo: 'SO-003', status: 'paid', amount: 240 },
          { orderNo: 'SO-004', status: 'paid', amount: 120 },
        ],
      });

      await expect(
        repository.findMany({
          sort: (sort) => sort.field('amount').desc(),
          cursor: { amount: 120, id: 2 },
          limit: 2,
          select: (select) => select.fields('id', 'orderNo', 'amount'),
        }),
      ).resolves.toEqual([
        { id: 4, orderNo: 'SO-004', amount: 120 },
        { id: 1, orderNo: 'SO-001', amount: 50 },
      ]);

      await expect(
        repository.findMany({
          distinct: ['status'],
          sort: (sort) => [sort.field('amount').desc(), sort.field('id').asc()],
          cursor: { amount: 240, id: 3 },
          select: (select) => select.fields('id'),
        }),
      ).resolves.toEqual([]);
    });

    it('validates cursor shape, sort coverage, nullability, and offset conflicts', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');

      await expect(
        repository.findMany({ cursor: { id: 1 } }),
      ).rejects.toMatchObject({ code: 'INVALID_PAGINATION', path: ['sort'] });
      await expect(
        repository.findMany({
          sort: (sort) => sort.field('amount').desc(),
          cursor: { amount: 10 },
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_PAGINATION',
        path: ['cursor', 'id'],
      });
      await expect(
        repository.findMany({
          sort: (sort) => sort.field('note').asc(),
          cursor: { note: 'ready', id: 1 },
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_PAGINATION',
        field: 'note',
      });
      await expect(
        repository.findMany({
          sort: (sort) => sort.field('id').asc(),
          cursor: { id: 1 },
          offset: 1,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
    });

    it('reads the nearest preceding cursor page without changing distinct representatives', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');
      await repository.createMany({
        values: [
          { orderNo: 'A', status: 'one', amount: 10 },
          { orderNo: 'B', status: 'two', amount: 30 },
          { orderNo: 'C', status: 'two', amount: 20 },
          { orderNo: 'D', status: 'three', amount: 40 },
        ],
      });
      expect(
        await repository.findMany({
          sort: (sort) => sort.field('id').asc(),
          cursor: { id: 4 },
          direction: 'backward',
          limit: 2,
          select: (select) => select.fields('orderNo'),
        }),
      ).toEqual([{ orderNo: 'B' }, { orderNo: 'C' }]);
      expect(
        await repository.findMany({
          distinct: ['status'],
          sort: (sort) => [sort.field('amount').desc(), sort.field('id').asc()],
          cursor: { amount: 10, id: 1 },
          direction: 'backward',
          limit: 1,
          select: (select) => select.fields('orderNo'),
        }),
      ).toEqual([{ orderNo: 'B' }]);
      expect(
        await repository.findMany({
          sort: (sort) => sort.field('id').asc(),
          cursor: { id: 1 },
          direction: 'backward',
          limit: 2,
        }),
      ).toEqual([]);
      await expect(
        repository.findMany({ direction: 'backward', limit: 2 }),
      ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
    });
  },
);
