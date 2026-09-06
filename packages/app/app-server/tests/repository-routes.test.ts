import { createApiClient, ApiClientError } from '@nocobase/api-client';
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

const actions: RepositoryApiAction[] = [
  'findMany',
  'findOne',
  'count',
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
