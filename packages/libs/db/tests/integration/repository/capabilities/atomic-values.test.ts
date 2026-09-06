import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders } from '../fixtures/scalar.js';

describeIntegrationDatabases(
  'Repository capabilities/atomic-values',
  (context) => {
    it('executes atomic updates with returning, nulls, version checks, and rollback', async () => {
      await createOrders(context);
      const repository = context.database.repository('repositoryOrders');
      await repository.createMany({
        values: [
          { orderNo: 'A', status: 'paid', amount: 20 },
          { orderNo: 'B', status: 'paid', amount: 40 },
        ],
      });
      const first = await repository.updateOne({
        filter: { orderNo: 'A' },
        ifVersion: 1,
        values: { amount: (value) => value.increment(4) },
        select: (select) => select.fields('amount', 'version'),
      });
      expect(first.record).toEqual({ amount: 24, version: 2 });
      await expect(
        repository.updateOne({
          filter: { orderNo: 'A' },
          ifVersion: 1,
          values: { amount: { decrement: 10 } },
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      await repository.updateMany({
        all: true,
        values: { amount: { multiply: 2 } },
      });
      await expect(
        repository.updateMany({
          all: true,
          values: { amount: { divide: 2 } },
          select: (select) => select.fields('amount'),
        }),
      ).resolves.toEqual({
        updatedCount: 2,
        records: [{ amount: 24 }, { amount: 40 }],
      });
      await expect(
        repository.upsertOne({
          filter: { orderNo: 'A' },
          create: { orderNo: 'A', status: 'paid', amount: 0 },
          update: { amount: { decrement: 4 } },
          select: (select) => select.fields('amount'),
        }),
      ).resolves.toMatchObject({ record: { amount: 20 } });
      for (const values of [
        { amount: { divide: 0 } },
        { amount: { increment: 1, multiply: 2 } },
        { amount: { increment: Infinity } },
        { status: { increment: 1 } },
        { amount: { increment: 1.5 } },
      ]) {
        await expect(
          repository.updateMany({ all: true, values }),
        ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      }
      await expect(
        repository.createOne({
          values: { orderNo: 'C', status: 'paid', amount: { increment: 1 } },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        repository.updateMany({
          all: true,
          values: { version: { increment: 1 } },
        }),
      ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE' });
      await expect(
        context.database.transaction(async (connection) => {
          await connection
            .repository('repositoryOrders')
            .updateMany({ all: true, values: { amount: { increment: 50 } } });
          throw new Error('rollback');
        }, context.spec.name),
      ).rejects.toThrow('rollback');
      expect(
        await repository.findOne({
          filter: { orderNo: 'A' },
          select: (select) => select.fields('amount'),
        }),
      ).toEqual({ amount: 20 });
    });

    it('preserves SQL null during numeric expressions', async () => {
      await context.builder.createCollection('atomicNullable', (collection) => {
        collection.increments('id');
        collection.integer('amount').nullable();
      });
      const repository = context.database.repository('atomicNullable');
      await repository.createOne({ values: { amount: null } });
      await expect(
        repository.updateMany({
          all: true,
          values: { amount: { increment: 1 } },
          select: (select) => select.fields('amount'),
        }),
      ).resolves.toEqual({ updatedCount: 1, records: [{ amount: null }] });
    });
  },
);
