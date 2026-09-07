import { expect, it } from 'vitest';
import type { AggregateAst } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository aggregate boundaries', (context) => {
  it('distinguishes all-null rows from no rows and ignores null numeric operands', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A', status: 'nulls' },
        { id: 'B', title: 'B', status: 'nulls' },
        { id: 'C', title: 'C', status: 'mixed', priority: 2 },
        { id: 'D', title: 'D', status: 'mixed', priority: 4 },
        { id: 'E', title: 'E', status: 'mixed' },
      ],
    });
    const aggregate: AggregateAst = Object.freeze({
      kind: 'aggregate',
      version: 1,
      items: Object.freeze([
        { kind: 'count', alias: 'rows' },
        { kind: 'count', field: 'priority', alias: 'present' },
        { kind: 'sum', field: 'priority', alias: 'total' },
        { kind: 'avg', field: 'priority', alias: 'mean' },
        { kind: 'min', field: 'priority', alias: 'low' },
        { kind: 'max', field: 'priority', alias: 'high' },
      ] as const),
    });
    for (const [status, rows] of [
      ['nulls', 2],
      ['absent', 0],
    ] as const) {
      expect(await tasks.aggregate({ filter: { status }, aggregate })).toEqual({
        rows,
        present: 0,
        total: null,
        mean: null,
        low: null,
        high: null,
      });
    }
    const mixed = await tasks.aggregate({
      filter: { status: 'mixed' },
      aggregate,
    });
    expect({
      ...mixed,
      total: Number(mixed.total),
      mean: Number(mixed.mean),
    }).toEqual({ rows: 3, present: 2, total: 6, mean: 3, low: 2, high: 4 });
    expect(aggregate.items).toHaveLength(6);
  });

  const invalid: unknown[] = [
    null,
    false,
    [],
    {},
    { kind: 'aggregate', version: 2, items: [] },
    { kind: 'aggregate', version: 1, items: null },
    {
      kind: 'aggregate',
      version: 1,
      collection: 'wrong',
      items: [{ kind: 'count', alias: 'rows' }],
    },
    ...[
      null,
      {},
      { kind: 'median', alias: 'rows' },
      { kind: 'count', alias: '' },
      { kind: 'count', alias: 1 },
      { kind: 'sum', alias: 'total' },
    ].map((item) => ({ kind: 'aggregate', version: 1, items: [item] })),
    {
      kind: 'aggregate',
      version: 1,
      items: [
        { kind: 'count', alias: 'n' },
        { kind: 'sum', field: 'points', alias: 'n' },
      ],
    },
  ];
  it.each(invalid.map((aggregate, index) => ({ aggregate, index })))(
    'rejects malformed aggregate $index through aggregate and groupBy',
    async ({ aggregate }) => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      await expect(
        tasks.aggregate({ aggregate: aggregate as never }),
      ).rejects.toMatchObject({ code: 'INVALID_AGGREGATE' });
      await expect(
        tasks.groupBy({ by: ['status'], aggregate: aggregate as never }),
      ).rejects.toMatchObject({ code: 'INVALID_AGGREGATE' });
    },
  );

  it.each([null, [], { total: {} }])(
    'rejects forged aggregate callback %j',
    async (result) => {
      await createDocumentationFixture(context);
      await expect(
        context.database
          .repository('tasks')
          .aggregate({ aggregate: () => result as never }),
      ).rejects.toMatchObject({ code: 'INVALID_AGGREGATE' });
    },
  );
});
