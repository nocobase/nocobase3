import { expectTypeOf, it } from 'vitest';
import {
  createApiClient,
  buildFindManyOptions,
  buildFindOneOptions,
  buildAggregateOptions,
  buildGroupByOptions,
  buildCreateOneOptions,
  buildUpdateOneOptions,
  buildDeleteOneOptions,
  type RemoteFilterAst,
  type RemoteSelectAst,
  type RemoteSortAst,
  type RemoteAggregateAst,
  type RemoteRepository,
} from '../../src/index.js';
interface Order {
  id: string;
  amount: number;
  status: string;
  tasks: { title: string }[];
}

it('exposes JSON output types and contextual builder types', () => {
  const many = buildFindManyOptions<Order>({
    filter: (f) => f.number('amount').gte(2),
    select: (s) => s.fields('id'),
    sort: (s) => s.field('amount').desc(),
  });
  expectTypeOf(many.select).toEqualTypeOf<RemoteSelectAst | undefined>();
  expectTypeOf(many.sort).toEqualTypeOf<RemoteSortAst | undefined>();
  expectTypeOf<
    Extract<typeof many.filter, (...args: never[]) => unknown>
  >().toEqualTypeOf<never>();
  const cursorOptions = buildFindManyOptions<{ createdAt: Date; id: bigint }>({
    cursor: { createdAt: new Date(), id: 1n },
  });
  expectTypeOf(cursorOptions.cursor?.createdAt).toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf(cursorOptions.cursor?.id).toEqualTypeOf<string | undefined>();
  const reusableCursor: Parameters<
    RemoteRepository<{ createdAt: Date; id: bigint }>['findMany']
  >[0] = cursorOptions;
  void reusableCursor;
  const aggregate = buildAggregateOptions<Order>({
    aggregate: (a) => ({ count: a.count(), total: a.sum('amount') }),
  });
  expectTypeOf(aggregate.aggregate).toEqualTypeOf<RemoteAggregateAst>();
  const create = buildCreateOneOptions<Partial<Order>, Order>({
    values: (v) => ({
      status: v.literal('paid'),
      tasks: (r) => r.create({ title: 'new' }),
    }),
    select: (s) => s.fields('id'),
  });
  const update = buildUpdateOneOptions<Order>({
    filter: (f) => f.string('id').eq('one'),
    values: {
      amount: (n) => n.increment(1),
      tasks: (r) => r.update({ values: { title: 'changed' } }),
    },
  });
  const dynamicUpdate = buildUpdateOneOptions({
    filter: { id: 'one' },
    values: {
      amount: (n) => n.increment(1),
      tasks: (r) => r.connect({ id: 'task' }),
    },
  });
  const dynamicCreate = buildCreateOneOptions({
    values: { tasks: (r) => r.create({ title: 'new' }) },
  });
  const dynamicFind = buildFindManyOptions({
    filter: { status: 'paid' },
    select: (s) => s.fields('id'),
  });
  void [dynamicUpdate, dynamicCreate, dynamicFind];
  const groups = buildGroupByOptions<Order>({
    by: ['status'],
    aggregate: (a) => ({ total: a.sum('amount') }),
    having: (f) => f.number('total').gte(2),
  });
  expectTypeOf(groups.having).toMatchTypeOf<object | undefined>();
  const api = createApiClient({ baseURL: '/api' });
  const repository = api.repository<Order>('orders');
  // Typecheck assignability without issuing requests during the runtime test.
  const accept: Parameters<typeof repository.createOne>[0] = create;
  const acceptUpdate: Parameters<typeof repository.updateOne>[0] = update;
  const acceptGroups: Parameters<typeof repository.groupBy>[0] = groups;
  void [accept, acceptUpdate, acceptGroups];
  const invalidInputs = () => {
    buildCreateOneOptions({
      values: {},
      // @ts-expect-error relationship policy belongs to the server
      writePolicy: false,
    });
    buildUpdateOneOptions({
      filter: { id: 'one' },
      values: {},
      // @ts-expect-error relationship policy belongs to the server
      writePolicy: { tasks: { operations: ['create'] } },
    });
    repository.createOne({
      values: {},
      // @ts-expect-error Remote Repository cannot grant relationship writes
      writePolicy: false,
    });
    repository.updateOne({
      filter: { id: 'one' },
      values: {},
      // @ts-expect-error Remote Repository cannot grant relationship writes
      writePolicy: false,
    });
    // @ts-expect-error filter is required for findOne
    buildFindOneOptions<Order>({});
    // @ts-expect-error select fields must belong to Order
    buildFindManyOptions<Order>({ select: (s) => s.fields('missing') });
    buildAggregateOptions<Order>({
      // @ts-expect-error aggregate fields must belong to Order
      aggregate: (a) => ({ total: a.sum('missing') }),
    });
    buildFindManyOptions<Order>({
      // @ts-expect-error callbacks must be synchronous
      filter: async () => ({}) as RemoteFilterAst,
    });
    // @ts-expect-error groupBy needs at least one field
    buildGroupByOptions<Order>({ by: [], aggregate: aggregate.aggregate });
    // @ts-expect-error update requires a filter
    buildUpdateOneOptions<Order>({ values: {} });
    // @ts-expect-error delete requires a filter
    buildDeleteOneOptions<Order>({});
  };
  void invalidInputs;
  void repository;
});
