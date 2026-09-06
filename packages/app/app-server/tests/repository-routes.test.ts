import {
  createApiClient,
  ApiClientError,
  buildFindManyOptions,
  buildGroupByOptions,
} from '@nocobase/api-client';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
  RepositoryError,
  type RepositoryQuery,
} from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defineRepositoryApiRoutes,
  type RepositoryApiAction,
} from '../src/router/index.js';
import { defineServerPlugin } from '../src/plugins/index.js';

interface Order {
  id: string;
  status: string;
  version: number;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

const actions: RepositoryApiAction[] = [
  'findMany',
  'findOne',
  'count',
  'aggregate',
  'groupBy',
  'exists',
  'createOne',
  'updateOne',
  'deleteOne',
];

describe('Repository API routes', () => {
  let database: DatabaseManager;
  let container: ServiceContainer;
  let router: Hono;

  beforeEach(async () => {
    database = createDatabaseManager({
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    await database.builder().createCollection('orders', (collection) => {
      collection.string('id').primary().notNull();
      collection.string('status').notNull();
      collection.integer('version').notNull();
      collection.optimisticLock('version');
    });
    const contribution = defineRepositoryApiRoutes({
      repositories: [
        { name: 'sales/orders', collection: 'orders', actions, maxLimit: 2 },
        { name: 'catalog', collection: 'orders', actions: ['findOne'] },
      ],
    });
    router = new Hono();
    router.route('/api', await contribution.createRouter({ container }));
    router.get('/api/unrelated', (context) => context.json({ ok: true }));
  });

  afterEach(async () => {
    await database.destroy();
  });

  function client() {
    return createApiClient({
      baseURL: 'http://localhost/api',
      fetch: async (input, init) => router.fetch(new Request(input, init)),
    });
  }

  function request(action: string, input: unknown) {
    return router.request(`/api/sales%2Forders:${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  it('executes all remote actions with builders and accepts options helpers over raw HTTP', async () => {
    const api = client();
    const orders = api.repository<Order>('sales/orders');
    const created = await orders.createOne({
      values: (v) => ({ id: 'built', status: v.literal('paid') }),
      select: (s) => s.fields('id', 'status', 'version'),
    });
    expect(created.record).toMatchObject({ id: 'built', status: 'paid' });
    expect(
      await orders.findOne({
        filter: (f) => f.string('id').eq('built'),
        select: (s) => s.fields('id'),
      }),
    ).toEqual({ id: 'built' });
    expect(
      await orders.count({ filter: (f) => f.string('status').eq('paid') }),
    ).toBe(1);
    expect(
      await orders.exists({ filter: (f) => f.string('id').eq('built') }),
    ).toBe(true);
    const options = buildFindManyOptions<Order>({
      filter: (f) => f.string('status').eq('paid'),
      select: (s) => s.fields('id'),
      sort: (s) => s.field('id').asc(),
    });
    expect(
      await api.request({
        path: '/sales%2Forders:findMany',
        method: 'POST',
        json: options,
      }),
    ).toEqual({ data: [{ id: 'built' }] });
    expect(await collect(orders.findMany(options))).toEqual([{ id: 'built' }]);
    expect(
      await orders.aggregate({
        aggregate: (a) => ({ count: a.count(), total: a.sum('version') }),
      }),
    ).toEqual({ count: 1, total: 1 });
    const groups = buildGroupByOptions<Order>({
      by: ['status'],
      aggregate: (a) => ({ count: a.count() }),
      having: (f) => f.number('count').gte(1),
      sort: (s) => s.field('count').desc(),
    });
    expect(await orders.groupBy(groups)).toEqual([
      { status: 'paid', count: 1 },
    ]);
    expect(
      await orders.updateOne({
        filter: (f) => f.string('id').eq('built'),
        values: (v) => ({ status: v.literal('shipped') }),
        select: (s) => s.fields('status'),
        ifVersion: 1,
      }),
    ).toMatchObject({ record: { status: 'shipped' } });
    expect(
      await orders.deleteOne({
        filter: (f) => f.string('id').eq('built'),
        select: (s) => s.fields('id'),
        ifVersion: 2,
      }),
    ).toMatchObject({ deleted: true, record: { id: 'built' } });
  });

  it('round-trips relation builders, client keys, nested filters and numeric updates through HTTP', async () => {
    await database.builder().createCollection('builderChildren', (c) => {
      c.string('id').primary();
      c.string('parentId').nullable();
      c.integer('points').defaultTo(0);
    });
    await database.builder().createCollection('builderParents', (c) => {
      c.string('id').primary();
      c.json('metadata');
      c.hasMany('children', 'builderChildren')
        .sourceKey('id')
        .foreignKey('parentId');
    });
    const contribution = defineRepositoryApiRoutes({
      repositories: [{ name: 'builderParents', actions }],
    });
    router.route('/api', await contribution.createRouter({ container }));
    const parents = client().repository('builderParents');
    const created = await parents.createOne({
      values: {
        id: 'parent',
        metadata: { update: { arbitrary: 'data' }, increment: 3 },
        children: (r) =>
          r.create({ id: 'child', points: 2 }, { clientKey: 'local-child' }),
      },
      select: (s) =>
        s
          .fields('id', 'metadata')
          .include('children', (c) => c.fields('id', 'points')),
    });
    expect(created.createdTargets).toEqual([
      {
        clientKey: 'local-child',
        collection: 'builderChildren',
        unique: { kind: 'unique', fields: ['id'], values: { id: 'child' } },
      },
    ]);
    expect(created.record).toMatchObject({
      children: [{ id: 'child', points: 2 }],
    });
    const metadata: unknown =
      typeof created.record.metadata === 'string'
        ? JSON.parse(created.record.metadata)
        : created.record.metadata;
    expect(metadata).toEqual({ update: { arbitrary: 'data' }, increment: 3 });
    await parents.updateOne({
      filter: (f) => f.string('id').eq('parent'),
      values: {
        children: (r) =>
          r.update({
            filter: (f) => f.string('id').eq('child'),
            values: { points: (n) => n.increment(3) },
          }),
      },
    });
    expect(
      await parents.findOne({
        filter: { id: 'parent' },
        select: (s) =>
          s.fields('id').include('children', (c) =>
            c.combine({
              records: c
                .fields('id', 'points')
                .filter((f) => f.number('points').gte(3))
                .sort((s) => s.field('points').desc()),
              total: c.sum('points'),
            }),
          ),
      }),
    ).toEqual({
      id: 'parent',
      children: { records: [{ id: 'child', points: 5 }], total: 5 },
    });
    await expect(
      parents.createOne({
        values: {
          id: 'invalid',
          children: {
            create: {
              kind: 'relationCreate',
              version: 1,
              values: { id: 'bad' },
              clientKey: 42,
            },
          },
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_MUTATION' });
  });

  it('supports anonymous client calls for all seven actions against a real database', async () => {
    const orders = client().repository<Order>('sales/orders');
    const created = await orders.createOne({
      values: { id: 'one', status: 'draft' },
    });
    expect(created).toMatchObject({
      record: { id: 'one', status: 'draft', version: 1 },
      createdTargets: [],
      version: 1,
    });
    expect(await orders.findOne({ filter: { id: 'one' } })).toEqual(
      created.record,
    );
    expect(await orders.findMany({ filter: { status: 'draft' } })).toEqual([
      created.record,
    ]);
    expect(await orders.count()).toBe(1);
    expect(await orders.exists({ filter: { id: 'one' } })).toBe(true);
    const updated = await orders.updateOne({
      filter: { id: 'one' },
      values: { status: 'paid' },
      ifVersion: created.version,
    });
    expect(updated).toMatchObject({
      record: { status: 'paid', version: 2 },
      version: 2,
    });
    await expect(
      orders.updateOne({
        filter: { id: 'one' },
        values: { status: 'draft' },
        ifVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(
      await orders.deleteOne({
        filter: { id: 'one' },
        ifVersion: updated.version,
      }),
    ).toEqual({ deleted: true });
    expect(await orders.findOne({ filter: { id: 'one' } })).toBeUndefined();
    expect(
      await (await request('findOne', { filter: { id: 'one' } })).json(),
    ).toEqual({ data: null });
    expect(await orders.exists({ filter: { id: 'one' } })).toBe(false);
    await expect(
      orders.deleteOne({ filter: { id: 'one' } }),
    ).rejects.toMatchObject({ status: 404, code: 'RECORD_NOT_FOUND' });
  });

  it('aggregates all matching rows and groups with HAVING and sort through the HTTP client', async () => {
    await database.repository('orders').createMany({
      values: [
        { id: 'a', status: 'paid' },
        { id: 'b', status: 'paid' },
        { id: 'c', status: 'draft' },
      ],
    });
    const orders = client().repository<Order>('sales/orders');
    const aggregate = {
      kind: 'aggregate',
      version: 1,
      items: [
        { kind: 'count', alias: 'count' },
        { kind: 'sum', field: 'version', alias: 'total' },
        { kind: 'avg', field: 'version', alias: 'average' },
        { kind: 'min', field: 'version', alias: 'minimum' },
        { kind: 'max', field: 'version', alias: 'maximum' },
      ],
    } as const;
    // maxLimit restricts findMany, never the input rows of an aggregate.
    expect(await orders.aggregate({ aggregate })).toEqual({
      count: 3,
      total: 3,
      average: 1,
      minimum: 1,
      maximum: 1,
    });
    expect(
      await orders.aggregate({ filter: { status: 'missing' }, aggregate }),
    ).toEqual({
      count: 0,
      total: null,
      average: null,
      minimum: null,
      maximum: null,
    });
    expect(
      await orders.aggregate({ filter: { status: 'paid' }, aggregate }),
    ).toMatchObject({ count: 2, total: 2 });
    expect(
      await orders.groupBy({
        by: ['status'],
        aggregate,
        having: {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'condition',
                path: ['count'],
                operator: '$gte',
                value: 2,
              },
            ],
          },
        },
        sort: {
          kind: 'sort',
          version: 1,
          items: [{ kind: 'field', path: ['total'], direction: 'desc' }],
        },
      }),
    ).toEqual([
      {
        status: 'paid',
        count: 2,
        total: 2,
        average: 1,
        minimum: 1,
        maximum: 1,
      },
    ]);
    expect(
      await orders.groupBy({
        by: ['status'],
        filter: { status: 'missing' },
        aggregate,
      }),
    ).toEqual([]);
    expect(
      await orders.groupBy({
        by: ['status'],
        aggregate,
        sort: {
          kind: 'sort',
          version: 1,
          items: [{ kind: 'field', path: ['count'], direction: 'desc' }],
        },
      }),
    ).toMatchObject([
      { status: 'paid', count: 2 },
      { status: 'draft', count: 1 },
    ]);
  });

  it('rejects invalid aggregate envelopes, ASTs, fields and unexposed actions', async () => {
    const aggregate = {
      kind: 'aggregate',
      version: 1,
      items: [{ kind: 'count', alias: 'count' }],
    };
    for (const [action, input] of [
      ['aggregate', {}],
      ['aggregate', { aggregate: [] }],
      ['aggregate', { aggregate: { ...aggregate, version: 2 } }],
      [
        'aggregate',
        {
          aggregate: {
            ...aggregate,
            items: [{ kind: 'raw', alias: 'x', sql: 'SELECT 1' }],
          },
        },
      ],
      [
        'aggregate',
        {
          aggregate: {
            ...aggregate,
            items: [{ kind: 'sum', field: 'missing', alias: 'x' }],
          },
        },
      ],
      ['aggregate', { aggregate, context: {} }],
      ['aggregate', { aggregate, limit: 1 }],
      ['groupBy', { aggregate }],
      ['groupBy', { aggregate, by: [] }],
      ['groupBy', { aggregate, by: [null] }],
      ['groupBy', { aggregate, by: ['missing'] }],
      ['groupBy', { aggregate, by: ['status'], having: [] }],
      ['groupBy', { aggregate, by: ['status'], having: { missing: 1 } }],
      [
        'groupBy',
        {
          aggregate,
          by: ['status'],
          sort: {
            kind: 'sort',
            version: 1,
            items: [{ kind: 'field', path: ['missing'], direction: 'asc' }],
          },
        },
      ],
    ] as const) {
      expect((await request(action, input)).status).toBe(400);
    }
    for (const action of ['aggregate', 'groupBy']) {
      const response = await router.request(`/api/catalog:${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aggregate, by: ['status'] }),
      });
      expect(response.status).toBe(404);
    }
  });

  it('serializes bigint aggregate results as lossless decimal strings', async () => {
    // Router repositories are resolved at construction time, so mount a fresh contribution.
    const contribution = defineRepositoryApiRoutes({
      repositories: [
        { name: 'bigints', collection: 'orders', actions: ['aggregate'] },
      ],
    });
    const repository = database.repository('orders');
    vi.spyOn(repository, 'aggregate').mockResolvedValue({
      total: 9007199254740993n,
    });
    vi.spyOn(database, 'repository').mockReturnValue(repository);
    const app = await contribution.createRouter({ container });
    const response = await app.request('/bigints:aggregate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [{ kind: 'sum', field: 'version', alias: 'total' }],
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { total: '9007199254740993' },
    });
  });

  it('applies the default limit and forwards JSON filter, select, sort, offset and cursor', async () => {
    await database.repository('orders').createMany({
      values: [
        { id: 'a', status: 'draft' },
        { id: 'b', status: 'paid' },
        { id: 'c', status: 'paid' },
      ],
    });
    const orders = client().repository<Order>('sales/orders');
    expect(await orders.findMany()).toHaveLength(2);
    const sort = {
      kind: 'sort' as const,
      version: 1 as const,
      items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
    };
    const select = {
      kind: 'select' as const,
      version: 1 as const,
      root: { kind: 'selection', fields: ['id'] },
    };
    expect(
      await orders.findMany({
        filter: {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'condition',
                path: ['status'],
                operator: '$eq',
                value: 'paid',
              },
            ],
          },
        },
        sort,
        select,
        offset: 1,
        limit: 1,
      }),
    ).toEqual([{ id: 'c' }]);
    expect(
      await orders.findMany({ sort, select, cursor: { id: 'a' }, limit: 1 }),
    ).toEqual([{ id: 'b' }]);
    expect(await orders.findMany({ limit: 0 })).toEqual([]);
    expect(await orders.count({ filter: { status: 'paid' } })).toBe(2);
  });

  it('streams findMany records as framed NDJSON', async () => {
    await database.repository('orders').createMany({
      values: [
        { id: 'a', status: 'draft' },
        { id: 'b', status: 'paid' },
        { id: 'c', status: 'paid' },
      ],
    });
    const response = await router.request('/api/sales%2Forders:findMany', {
      method: 'POST',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ filter: { status: 'paid' } }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    expect(response.headers.get('vary')).toBe('Accept');
    expect(
      (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as unknown),
    ).toEqual([
      {
        type: 'record',
        data: { id: 'b', status: 'paid', version: 1 },
      },
      {
        type: 'record',
        data: { id: 'c', status: 'paid', version: 1 },
      },
      { type: 'end' },
    ]);
  });

  it('streams findMany records through the public API client', async () => {
    await database.repository('orders').createMany({
      values: [
        { id: 'a', status: 'draft' },
        { id: 'b', status: 'paid' },
        { id: 'c', status: 'paid' },
      ],
    });

    await expect(
      collect(
        client()
          .repository<Order>('sales/orders')
          .findMany({ filter: { status: 'paid' } }),
      ),
    ).resolves.toEqual([
      { id: 'b', status: 'paid', version: 1 },
      { id: 'c', status: 'paid', version: 1 },
    ]);
  });

  it('returns preflight Repository errors as HTTP errors before streaming starts', async () => {
    const response = await router.request('/api/sales%2Forders:findMany', {
      method: 'POST',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ filter: { missingField: 'x' } }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'FIELD_NOT_FOUND',
      message: expect.any(String),
    });
  });

  it('frames Repository errors that occur after streaming starts', async () => {
    const repository = database.repository('orders');
    const streamed = (async function* (): AsyncIterable<
      Record<string, unknown>
    > {
      yield { id: 'a', status: 'paid', version: 1 };
      throw new RepositoryError('INVALID_FILTER', 'Streaming query failed.');
    })();
    vi.spyOn(repository, 'findMany').mockReturnValue(
      streamed as RepositoryQuery<Record<string, unknown>>,
    );
    vi.spyOn(database, 'repository').mockReturnValue(repository);
    const contribution = defineRepositoryApiRoutes({
      repositories: [
        { name: 'stream-error', collection: 'orders', actions: ['findMany'] },
      ],
    });
    router.route('/api', await contribution.createRouter({ container }));

    const response = await router.request('/api/stream-error:findMany', {
      method: 'POST',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
      },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(
      (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as unknown),
    ).toEqual([
      {
        type: 'record',
        data: { id: 'a', status: 'paid', version: 1 },
      },
      {
        type: 'error',
        error: {
          code: 'INVALID_FILTER',
          message: 'Streaming query failed.',
        },
      },
    ]);
  });

  it('does not expose undeclared collections or actions and preserves other routes', async () => {
    for (const path of [
      '/api/orders:findMany',
      '/api/catalog:createOne',
      '/api/sales%2Forders:deleteMany',
      '/api/users:findMany',
    ]) {
      expect((await router.request(path, { method: 'POST' })).status).toBe(404);
    }
    expect((await router.request('/api/sales%2Forders:findMany')).status).toBe(
      404,
    );
    expect(await (await router.request('/api/unrelated')).json()).toEqual({
      ok: true,
    });
  });

  it.each([
    ['findMany', null],
    ['findMany', []],
    ['findMany', { context: {} }],
    ['findMany', { limit: 3 }],
    ['findMany', { limit: -1 }],
    ['findMany', { limit: '1' }],
    ['findMany', { filter: [] }],
    ['findMany', { sort: null }],
    ['findMany', { filter: { missingField: 'x' } }],
    ['findOne', {}],
    ['createOne', {}],
    ['updateOne', { values: {} }],
    ['deleteOne', {}],
    [
      'createOne',
      { values: { id: 'one', status: 'draft' }, idempotencyKey: 'key' },
    ],
  ])('rejects invalid %s input without writing: %j', async (action, input) => {
    const response = await request(action as string, input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
    expect(await database.repository('orders').count()).toBe(0);
  });

  it('rejects malformed JSON, non-JSON requests and oversized bodies', async () => {
    const path = '/api/sales%2Forders:findMany';
    expect(
      (
        await router.request(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400);
    expect(
      (await router.request(path, { method: 'POST', body: '{}' })).status,
    ).toBe(415);
    expect(
      (
        await request('createOne', {
          values: { id: 'big', status: 'x'.repeat(1024 * 1024) },
        })
      ).status,
    ).toBe(413);
    expect(await database.repository('orders').count()).toBe(0);
  });

  it('keeps unexpected failures as server errors rather than invalid input', async () => {
    router.onError((_error, context) =>
      context.json(
        { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        500,
      ),
    );
    const repository = database.repository('orders');
    vi.spyOn(repository, 'count').mockRejectedValue(
      new Error('Database unavailable'),
    );
    vi.spyOn(database, 'repository').mockReturnValue(repository);
    const contribution = defineRepositoryApiRoutes({
      repositories: [{ name: 'broken', actions: ['count'] }],
    });
    router.route('/api', await contribution.createRouter({ container }));
    await expect(
      client().repository('broken').count(),
    ).rejects.toMatchObject<ApiClientError>({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('snapshots declarations and resolves the configured connection only at router creation', async () => {
    const repository = database.repository('orders');
    const resolve = vi
      .spyOn(database, 'repository')
      .mockReturnValue(repository);
    const entries = [
      {
        name: 'external',
        collection: 'orders',
        connection: 'secondary',
        actions: ['count'] as RepositoryApiAction[],
      },
    ];
    const contribution = defineRepositoryApiRoutes({ repositories: entries });
    defineServerPlugin({
      packageName: '@nocobase/app-plugin-test',
      routes: [contribution],
    });
    expect(contribution.scope).toBe('api');
    expect(resolve).not.toHaveBeenCalled();
    entries[0]!.actions.push('deleteOne');
    entries[0]!.collection = 'changed';
    const routes = await contribution.createRouter({ container });
    expect(resolve).toHaveBeenCalledWith('orders', 'secondary');
    expect(
      (await routes.request('/external:deleteOne', { method: 'POST' })).status,
    ).toBe(404);
    expect(
      await (
        await routes.request('/external:count', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).json(),
    ).toEqual({ data: 0 });
  });

  it('rejects ambiguous declarations and permits an empty exposure list without database services', async () => {
    for (const name of ['', '*', 'orders*']) {
      expect(() =>
        defineRepositoryApiRoutes({
          repositories: [{ name, actions: ['count'] }],
        }),
      ).toThrow();
    }
    expect(() =>
      defineRepositoryApiRoutes({
        repositories: [{ name: 'orders', actions: ['count', 'count'] }],
      }),
    ).toThrow();
    expect(() =>
      defineRepositoryApiRoutes({
        repositories: [{ name: 'orders', actions: ['count'], maxLimit: 0 }],
      }),
    ).toThrow();
    expect(() =>
      defineRepositoryApiRoutes({
        repositories: [
          { name: 'orders', actions: [] },
          { name: 'orders', actions: [] },
        ],
      }),
    ).toThrow();
    const empty = defineRepositoryApiRoutes({ repositories: [] });
    expect(
      (
        await (
          await empty.createRouter({ container: new ServiceContainer() })
        ).request('/anything')
      ).status,
    ).toBe(404);
  });
});
