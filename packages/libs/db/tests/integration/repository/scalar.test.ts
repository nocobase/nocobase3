import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

describeIntegrationDatabases('scalar Repository', (context) => {
  it('runs Collection-aware reads, filters, sorts, variables, and pagination', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'SO-001', status: 'draft', amount: 50, note: '' },
        { orderNo: 'SO-002', status: 'paid', amount: 120, note: null },
        { orderNo: 'SO-003', status: 'paid', amount: 240, note: 'priority' },
      ],
    });

    await expect(
      repository.findMany({
        select: selection(['orderNo', 'amount']),
        context: { minimum: 100 },
        filter: (filter) =>
          filter.and([
            filter.string('status').eq('paid'),
            filter.number('amount').gte(filter.variable('$minimum')),
          ]),
        sort: sorting('amount', 'desc'),
        limit: 1,
      }),
    ).resolves.toEqual([{ orderNo: 'SO-003', amount: 240 }]);
    await expect(
      repository.count({
        filter: (filter) => filter.string('note').empty(),
      }),
    ).resolves.toBe(2);
    await expect(
      repository.exists({
        filter: (filter) => filter.string('note').includes('prior'),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.findOne({
        filter: (filter) => filter.string('orderNo').eq('SO-002'),
      }),
    ).resolves.toMatchObject({ orderNo: 'SO-002', status: 'paid' });
    await expect(
      repository.findOne({
        select: (select) => select.fields('orderNo', 'amount'),
        sort: (sort) => sort.field('amount').desc(),
      }),
    ).resolves.toEqual({ orderNo: 'SO-003', amount: 240 });
  });

  it('normalizes equality shorthand with implicit AND and strict null semantics', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        {
          orderNo: 'SO-001',
          status: 'draft',
          amount: 50,
          note: '',
          enabled: false,
        },
        {
          orderNo: 'SO-002',
          status: 'paid',
          amount: 120,
          note: null,
          enabled: true,
        },
        {
          orderNo: 'SO-003',
          status: 'paid',
          amount: 240,
          note: 'priority',
          enabled: null,
        },
      ],
    });

    await expect(
      repository.findMany({
        filter: { status: 'paid', enabled: true },
        select: selection(['orderNo']),
      }),
    ).resolves.toEqual([{ orderNo: 'SO-002' }]);
    await expect(
      repository.findMany({
        filter: { note: null },
        select: selection(['orderNo']),
      }),
    ).resolves.toEqual([{ orderNo: 'SO-002' }]);
    await expect(
      repository.findMany({
        filter: { enabled: null },
        select: selection(['orderNo']),
      }),
    ).resolves.toEqual([{ orderNo: 'SO-003' }]);
    await expect(
      repository.findOne({
        filter: { enabled: false },
        select: selection(['orderNo']),
      }),
    ).resolves.toEqual({ orderNo: 'SO-001' });
  });

  it('rejects unsafe or unsupported filter shorthand', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(repository.findMany({ filter: {} })).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
    await expect(
      repository.findMany({ filter: { orderNo: undefined } }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER', field: 'orderNo' });
    await expect(
      repository.findMany({ filter: { missing: 'SO-001' } }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
  });

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

  it('validates Collection Field capabilities and preserves transaction binding', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');

    await expect(
      repository.findMany({
        filter: (filter) => filter.number('status').eq(1),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    await expect(
      repository.createOne({
        values: { orderNo: 'SO-001', status: 'draft', amount: 1, version: 9 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE' });
    await expect(
      repository.updateOne({
        filter: (filter) => filter.string('missing').eq('draft'),
        values: { amount: 2 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });

    await expect(
      context.database.transaction(async (connection) => {
        await connection.repository('repositoryOrders').createOne({
          values: { orderNo: 'ROLLBACK', status: 'draft', amount: 1 },
        });
        throw new Error('rollback');
      }, context.spec.name),
    ).rejects.toThrow('rollback');
    await expect(
      repository.exists({
        filter: (filter) => filter.string('orderNo').eq('ROLLBACK'),
      }),
    ).resolves.toBe(false);
  });
});

async function createOrders(context: IntegrationTestContext): Promise<void> {
  await context.builder.createCollection('repositoryOrders', (collection) => {
    collection.increments('id');
    collection.string('orderNo').notNull().unique();
    collection.string('status').notNull();
    collection.integer('amount').notNull();
    collection.string('note').nullable();
    collection.boolean('enabled').nullable();
    collection.integer('version').notNull();
    collection.optimisticLock('version');
  });
}

function selection(fields: readonly string[]): {
  readonly kind: 'select';
  readonly version: 1;
  readonly root: {
    readonly kind: 'selection';
    readonly fields: readonly string[];
  };
} {
  return {
    kind: 'select' as const,
    version: 1 as const,
    root: { kind: 'selection' as const, fields },
  };
}

function sorting(
  field: string,
  direction: 'asc' | 'desc',
): {
  readonly kind: 'sort';
  readonly version: 1;
  readonly items: readonly [
    {
      readonly kind: 'field';
      readonly path: readonly [string];
      readonly direction: 'asc' | 'desc';
    },
  ];
} {
  return {
    kind: 'sort' as const,
    version: 1 as const,
    items: [{ kind: 'field' as const, path: [field] as const, direction }],
  };
}
