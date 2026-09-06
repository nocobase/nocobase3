import { describe, expect, it } from 'vitest';
import {
  buildFilter,
  buildSelect,
  buildSort,
  buildAggregate,
  buildCreateValues,
  buildUpdateValues,
} from '../src/index.js';

interface Order {
  id: string;
  status: string;
  amount: number;
  metadata: Record<string, unknown>;
  tasks: object[];
}

describe('portable query builders', () => {
  it('builds scalar, relation, JSON, date and variable filters', () => {
    const ast = buildFilter<Order>((f) =>
      f.and([
        f.string('status').eq('paid'),
        f.relation('tasks').some((t) => t.number('points').gte(2)),
        f.json('metadata').path(['tags']).has('urgent'),
        f.date('createdAt').on(new Date('2026-01-02T00:00:00Z')),
        f.string('ownerId').eq(f.variable('$user.id')),
      ]),
    );
    expect(ast).toMatchObject({
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          { path: ['status'], operator: '$eq', value: 'paid' },
          {
            kind: 'relation',
            path: ['tasks'],
            quantifier: 'some',
            filter: {
              items: [{ path: ['points'], operator: '$gte', value: 2 }],
            },
          },
          {
            path: ['metadata'],
            jsonPath: ['tags'],
            operator: '$jsonHas',
            value: 'urgent',
          },
          { path: ['createdAt'], value: '2026-01-02T00:00:00.000Z' },
          { value: { kind: 'variable', path: '$user.id' } },
        ],
      },
    });
    expect(buildFilter({ status: 'paid' })).toEqual(
      buildFilter((f) => f.string('status').eq('paid')),
    );
    expect(buildFilter(ast)).toEqual(ast);
    expect(buildFilter(ast)).not.toBe(ast);
  });

  it('converts nested selects and combine branches to complete JSON', () => {
    const ast = buildSelect<Order>((s) =>
      s.fields('id').include('tasks', (t) =>
        t.combine({
          records: t
            .fields('title')
            .filter((f) => f.number('points').gte(2))
            .sort((s) => s.field('points').desc())
            .limit(3)
            .include('assignee', (a) => a.fields('name')),
          total: t.filter({ done: true }).sum('points'),
          nested: t.combine({ count: t.count() }),
        }),
      ),
    );
    expect(JSON.parse(JSON.stringify(ast))).toEqual(ast);
    expect(ast.root.includes?.[0]).toMatchObject({
      relation: 'tasks',
      result: {
        kind: 'combine',
        branches: {
          records: {
            select: {
              fields: ['title'],
              includes: [
                { relation: 'assignee', select: { fields: ['name'] } },
              ],
            },
            filter: { kind: 'filter' },
            sort: { kind: 'sort' },
            limit: 3,
          },
          total: {
            filter: { kind: 'filter' },
            result: { kind: 'sum', field: 'points' },
          },
          nested: {
            result: {
              kind: 'combine',
              branches: { count: { result: { kind: 'count' } } },
            },
          },
        },
      },
    });
    expect(ast.collection).toBeUndefined();
    expect(buildSelect(ast)).toEqual(ast);
  });

  it('builds aggregate aliases and relation aggregate sorts', () => {
    expect(
      buildAggregate<Order>((a) => ({
        count: a.count(),
        total: a.sum('amount'),
        average: a.avg('amount'),
        minimum: a.min('amount'),
        maximum: a.max('amount'),
      })).items,
    ).toEqual([
      { kind: 'count', alias: 'count' },
      { kind: 'sum', alias: 'total', field: 'amount' },
      { kind: 'avg', alias: 'average', field: 'amount' },
      { kind: 'min', alias: 'minimum', field: 'amount' },
      { kind: 'max', alias: 'maximum', field: 'amount' },
    ]);
    expect(
      buildSort((s) => [
        s.field('amount').desc().nullsLast(),
        s.relation('tasks').count().asc(),
      ]).items,
    ).toEqual([
      { kind: 'field', path: ['amount'], direction: 'desc', nulls: 'last' },
      {
        kind: 'aggregate',
        relation: ['tasks'],
        aggregate: 'count',
        direction: 'asc',
      },
    ]);
  });

  it('rejects invalid/async callbacks and unconverted functions', () => {
    expect(() => buildFilter((() => undefined) as never)).toThrow(
      'Filter node',
    );
    expect(() => buildFilter((async () => ({})) as never)).toThrow(
      'Filter node',
    );
    expect(() => buildSelect((() => ({})) as never)).toThrow('Select Builder');
    expect(() => buildSort((() => ({})) as never)).toThrow('Sort Builder');
    expect(() => buildAggregate((() => ({ total: 1 })) as never)).toThrow(
      'Aggregate Builder',
    );
    expect(() => buildAggregate((async () => ({})) as never)).toThrow(
      'Aggregate Builder',
    );
    expect(() =>
      buildFilter({
        kind: 'filter',
        version: 1,
        root: { kind: 'group', logic: 'and', items: [() => true] },
      } as never),
    ).toThrow('callbacks');
  });
});

describe('portable mutation builders', () => {
  it('preserves JSON data and serializes dates/bigints without evaluating arbitrary payload callbacks', () => {
    const metadata = { increment: 1, filter: 'data', select: 'data' };
    const result = buildCreateValues({
      metadata,
      payload: { update: { arbitrary: 'data' } },
      date: new Date('2026-01-01Z'),
      big: 9007199254740993n,
    });
    expect(result).toEqual({
      metadata,
      payload: { update: { arbitrary: 'data' } },
      date: '2026-01-01T00:00:00.000Z',
      big: '9007199254740993',
    });
    expect(result.metadata).not.toBe(metadata);
    expect(() =>
      buildCreateValues({ metadata: { arbitrary: (): string => 'data' } }),
    ).toThrow('callbacks');
    expect(() => buildCreateValues({ value: Number.NaN })).toThrow('finite');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => buildCreateValues(cyclic as never)).toThrow('Circular');
  });

  it('builds whole values callbacks, literals, atomic numeric updates and nested relation operations', () => {
    const result = buildUpdateValues<Partial<Order>>((v) => ({
      status: v.literal('paid'),
      amount: (n) => n.increment(2),
      tasks: (r) =>
        r
          .update({
            filter: (f) => f.string('title').eq('one'),
            values: {
              points: (n) => n.multiply(3),
              assignee: (a) => a.connect({ id: 1 }),
            },
          })
          .upsert({
            filter: (f) => f.string('title').eq('two'),
            create: { title: 'two' },
            update: { points: (n) => n.decrement(1) },
          })
          .delete({ filter: (f) => f.number('points').eq(0) }),
    }));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result).toMatchObject({
      status: { kind: 'literal', value: 'paid' },
      amount: { increment: 2 },
      tasks: {
        update: [
          {
            filter: { kind: 'filter' },
            values: {
              points: { multiply: 3 },
              assignee: { connect: [{ id: 1 }] },
            },
          },
        ],
        upsert: [
          { filter: { kind: 'filter' }, update: { points: { decrement: 1 } } },
        ],
        delete: [{ filter: { kind: 'filter' } }],
      },
    });
  });

  it('preserves client keys, through values, clear/set and callbacks in JSON relation inputs', () => {
    expect(
      buildCreateValues({
        tags: (r) =>
          r
            .create(
              { label: 'new' },
              { clientKey: 'local', through: { role: 'owner' } },
            )
            .connect({ id: 1 }, { through: { role: 'reader' } }),
      }),
    ).toEqual({
      tags: {
        create: [
          {
            kind: 'relationCreate',
            version: 1,
            values: { label: 'new' },
            clientKey: 'local',
            through: { role: 'owner' },
          },
        ],
        connect: [{ where: { id: 1 }, through: { role: 'reader' } }],
      },
    });
    expect(
      buildUpdateValues({
        tags: (r) => r.disconnect(),
        tasks: (r) => r.set([{ id: 1 }]),
      }),
    ).toEqual({ tags: { disconnect: true }, tasks: { set: [{ id: 1 }] } });
    expect(
      buildCreateValues({
        tasks: { create: { title: 'new', owner: (r) => r.connect({ id: 1 }) } },
      }),
    ).toEqual({
      tasks: { create: { title: 'new', owner: { connect: [{ id: 1 }] } } },
    });
  });

  it('rejects callbacks that do not return builder results', () => {
    expect(() =>
      buildUpdateValues({ amount: (() => undefined) as never }),
    ).toThrow('Callbacks');
    expect(() =>
      buildUpdateValues({ amount: (async () => ({ increment: 1 })) as never }),
    ).toThrow('Callbacks');
    expect(() => buildCreateValues((async () => ({})) as never)).toThrow(
      'Values callbacks',
    );
    expect(() =>
      buildCreateValues({
        metadata: { kind: 'literal', value: { callback: (): number => 1 } },
      }),
    ).toThrow('callbacks');
  });
  it('rejects recursive field callbacks and mixed numeric/relation operations', () => {
    const recursive = (
      r: import('../src/index.js').CreateRelationFieldMutationBuilder,
    ): import('../src/index.js').CreateRelationFieldMutationBuilder =>
      r.create({ children: recursive });
    expect(() => buildCreateValues({ children: recursive })).toThrow(
      'Circular',
    );
    expect(() =>
      buildUpdateValues({
        field: (r) => {
          r.connect({ id: 1 });
          return r.increment(2);
        },
      }),
    ).toThrow('mix numeric');
    expect(() =>
      buildUpdateValues({
        field: (r) => {
          r.increment(2);
          return r.connect({ id: 1 });
        },
      }),
    ).toThrow('mix numeric');
  });
});
