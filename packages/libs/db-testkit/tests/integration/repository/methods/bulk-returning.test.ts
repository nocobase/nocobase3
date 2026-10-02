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

  // One statement per locked row set used to OR every key together, which
  // SQLite refuses past about a thousand rows ("Expression tree is too large").
  it('updates, checks scope for, reloads and deletes more rows than one statement can address', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    const total = 1200;
    for (let start = 0; start < total; start += 200) {
      await repository.createMany({
        values: Array.from({ length: 200 }, (_, offset) => ({
          orderNo: `SO-${String(start + offset).padStart(5, '0')}`,
          status: 'draft',
          amount: start + offset,
        })),
      });
    }

    const updated = await repository.updateMany({
      filter: { status: 'draft' },
      values: { status: 'paid' },
      select: (select) => select.fields('id', 'status'),
    });
    expect(updated.updatedCount).toBe(total);
    expect(updated.records.map((record) => record.id)).toEqual(
      Array.from({ length: total }, (_, index) => index + 1),
    );
    expect(updated.records.every((record) => record.status === 'paid')).toBe(
      true,
    );

    const scoped = repository.withPolicy({
      read: { scope: { status: 'paid' }, fields: ['id', 'status'] },
      create: { scope: { status: 'paid' }, fields: ['status'] },
      update: { scope: { status: 'paid' }, fields: ['status'] },
      delete: { scope: { status: 'paid' } },
    });
    await expect(
      scoped.updateMany({ all: true, values: { status: 'paid' } }),
    ).resolves.toEqual({ updatedCount: total });
    await expect(
      scoped.updateMany({ all: true, values: { status: 'void' } }),
    ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    await expect(
      repository.count({ filter: { status: 'paid' } }),
    ).resolves.toBe(total);

    const deleted = await repository.deleteMany({
      all: true,
      select: (select) => select.fields('id'),
    });
    expect(deleted.deletedCount).toBe(total);
    expect(deleted.records).toHaveLength(total);
    await expect(repository.count()).resolves.toBe(0);
  });
});
