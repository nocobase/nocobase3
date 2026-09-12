import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createOrders, selection } from '../fixtures/scalar.js';

describeIntegrationDatabases('Repository capabilities/filter', (context) => {
  it('filters textual values with explicit case folding and literal patterns', async () => {
    await createOrders(context);
    const repository = context.database.repository('repositoryOrders');
    await repository.createMany({
      values: [
        { orderNo: 'A', status: 'NB-Chen_100%', amount: 1 },
        { orderNo: 'B', status: 'nb-chenX100Y', amount: 2 },
        { orderNo: 'C', status: 'Other', amount: 3 },
      ],
    });
    const select = (select: import('../../../../src/index.js').SelectBuilder) =>
      select.fields('orderNo');
    expect(
      await repository.findMany({
        filter: (filter) =>
          filter.string('status').eq('NB-CHEN_100%', { mode: 'insensitive' }),
        select,
      }),
    ).toEqual([{ orderNo: 'A' }]);
    expect(
      await repository.findMany({
        filter: (filter) =>
          filter.string('status').includes('_100%', { mode: 'insensitive' }),
        select,
      }),
    ).toEqual([{ orderNo: 'A' }]);
    expect(
      await repository.findMany({
        filter: (filter) =>
          filter.string('status').startsWith('nb-', { mode: 'insensitive' }),
        select,
      }),
    ).toEqual([{ orderNo: 'A' }, { orderNo: 'B' }]);
    expect(
      await repository.findMany({
        filter: (filter) =>
          filter.string('status').endsWith('100%', { mode: 'insensitive' }),
        select,
      }),
    ).toEqual([{ orderNo: 'A' }]);
    expect(
      await repository.findMany({
        filter: (filter) =>
          filter.string('status').notIncludes('chen', { mode: 'insensitive' }),
        select,
      }),
    ).toEqual([{ orderNo: 'C' }]);
    await expect(
      repository.findMany({
        filter: {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'condition',
                path: ['amount'],
                operator: '$eq',
                value: 1,
                mode: 'insensitive',
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
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
        sort: (s) => s.field('orderNo').asc(),
        select: selection(['orderNo']),
      }),
    ).resolves.toEqual(
      context.spec.dialect === 'oracle'
        ? [{ orderNo: 'SO-001' }, { orderNo: 'SO-002' }]
        : [{ orderNo: 'SO-002' }],
    );
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
});
