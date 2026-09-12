import { describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  buildFilter,
  buildFindManyOptions,
  buildFindOneOptions,
  buildCountOptions,
  buildExistsOptions,
  buildAggregateOptions,
  buildGroupByOptions,
  buildCreateOneOptions,
  buildUpdateOneOptions,
  buildDeleteOneOptions,
  type FilterBuilder,
  type SelectBuilder,
} from '../src/index.js';

interface Order {
  id: string;
  status: string;
  amount: number;
  tasks: object[];
}
const filter = (f: FilterBuilder<Order>) => f.string('status').eq('paid');

describe('Repository options builders', () => {
  it('covers all nine actions and agrees with Repository request bodies', async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ data: [] })));
    const api = createApiClient({ baseURL: '/api', fetch: fetchRequest });
    const repository = api.repository<Order>('orders');
    const read = {
      filter,
      select: (s: SelectBuilder<Order>) => s.fields('id'),
    };
    const findMany = buildFindManyOptions<Order>({
      ...read,
      sort: (s) => s.field('id').asc(),
      limit: 2,
      offset: 0,
      direction: 'forward',
      distinct: ['id'],
      cursor: { id: 'first' },
    });
    const findOne = buildFindOneOptions<Order>(read);
    const aggregate = buildAggregateOptions<Order>({
      filter,
      aggregate: (a) => ({ count: a.count(), total: a.sum('amount') }),
    });
    const groups = buildGroupByOptions<Order>({
      filter,
      by: ['status'],
      aggregate: (a) => ({ count: a.count() }),
      having: (f) => f.number('count').gte(1),
      sort: (s) => s.field('count').desc(),
    });
    const create = buildCreateOneOptions<Partial<Order>, Order>({
      values: (v) => ({ status: v.literal('paid') }),
      select: read.select,
    });
    const update = buildUpdateOneOptions<Order>({
      filter,
      values: { amount: (n) => n.increment(2) },
      ifVersion: 1,
      select: read.select,
    });
    const remove = buildDeleteOneOptions<Order>({
      filter,
      select: read.select,
      ifVersion: 2,
    });
    const expected = [
      findMany,
      findOne,
      buildCountOptions<Order>({ filter }),
      buildExistsOptions<Order>({ filter }),
      aggregate,
      groups,
      create,
      update,
      remove,
    ];
    await repository.findMany({
      ...read,
      sort: (s) => s.field('id').asc(),
      limit: 2,
      offset: 0,
      direction: 'forward',
      distinct: ['id'],
      cursor: { id: 'first' },
    });
    await repository.findOne(read);
    await repository.count({ filter });
    await repository.exists({ filter });
    await repository.aggregate({
      filter,
      aggregate: (a) => ({ count: a.count(), total: a.sum('amount') }),
    });
    await repository.groupBy({
      filter,
      by: ['status'],
      aggregate: (a) => ({ count: a.count() }),
      having: (f) => f.number('count').gte(1),
      sort: (s) => s.field('count').desc(),
    });
    await repository.createOne({
      values: (v) => ({ status: v.literal('paid') }),
      select: read.select,
    });
    await repository.updateOne({
      filter,
      values: { amount: (n) => n.increment(2) },
      ifVersion: 1,
      select: read.select,
    });
    await repository.deleteOne({ filter, select: read.select, ifVersion: 2 });
    expect(
      fetchRequest.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)) as unknown,
      ),
    ).toEqual(expected);
    for (const json of expected)
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    await api.request({
      path: '/custom',
      method: 'POST',
      json: { criteria: buildFilter<Order>(filter) },
    });
    expect(JSON.parse(String(fetchRequest.mock.lastCall?.[1]?.body))).toEqual({
      criteria: buildFilter<Order>(filter),
    });
  });

  it('evaluates callbacks once at query creation and shares snapshots with streaming', async () => {
    let status = 'paid';
    const callback = vi.fn((f: Parameters<typeof filter>[0]) =>
      f.string('status').eq(status),
    );
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(new Response('{"type":"end"}\n'));
    const repository = createApiClient({
      baseURL: '/api',
      fetch: fetchRequest,
    }).repository<Order>('orders');
    const query = repository.findMany({ filter: callback });
    const streamed = repository.findMany({ filter: callback });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(fetchRequest).not.toHaveBeenCalled();
    status = 'changed';
    await query;
    await query;
    for await (const row of streamed) {
      void row;
    }
    expect(callback).toHaveBeenCalledTimes(2);
    expect(fetchRequest.mock.calls[0]?.[1]?.body).toBe(
      fetchRequest.mock.calls[1]?.[1]?.body,
    );
    expect(String(fetchRequest.mock.calls[0]?.[1]?.body)).toContain('paid');
  });

  it('preserves ASTs, shorthand and ordinary options without supplying defaults', () => {
    expect(buildFindManyOptions()).toEqual({});
    expect(buildCountOptions()).toEqual({});
    expect(buildExistsOptions()).toEqual({});
    const source = { filter: { status: 'paid' }, limit: 2 };
    const result = buildFindManyOptions(source);
    source.filter.status = 'changed';
    expect(result).toEqual({ filter: { status: 'paid' }, limit: 2 });
    expect(buildFindManyOptions(result)).toEqual(result);
    const ast = buildFilter<Order>(filter);
    expect(buildFindOneOptions({ filter: ast }).filter).toEqual(ast);
  });

  it('fails locally before sending invalid callback results', () => {
    const fetchRequest = vi.fn<typeof fetch>();
    const repository = createApiClient({
      baseURL: '/api',
      fetch: fetchRequest,
    }).repository<Order>('orders');
    expect(() =>
      repository.findMany({ filter: (() => undefined) as never }),
    ).toThrow('Filter node');
    expect(() =>
      repository.count({ filter: (async () => ({})) as never }),
    ).toThrow('Filter node');
    expect(() =>
      buildFindManyOptions({ cursor: { id: (() => 'id') as never } }),
    ).toThrow('callbacks');
    expect(() =>
      buildUpdateOneOptions({
        filter: { id: 'one' },
        values: { amount: (() => undefined) as never },
      }),
    ).toThrow('Callbacks');
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
