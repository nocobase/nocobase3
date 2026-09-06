import { loadGroupByExamples, type GroupByExample } from './group-by.js';
import type {
  ApiClient,
  RemoteAggregateAst,
  RemoteFilterAst,
  RemoteSelectAst,
} from '@nocobase/api-client';
import type {
  AggregateRequest,
  AggregateResponse,
  AggregateScalar,
} from '../shared/aggregate.js';
export interface AggregateCall {
  readonly repository: string;
  readonly action: string;
  readonly options: unknown;
  readonly result: unknown;
}
export async function loadAggregate(
  api: ApiClient,
  query: AggregateRequest,
): Promise<{
  data: AggregateResponse;
  calls: AggregateCall[];
  examples: GroupByExample[];
}> {
  const calls: AggregateCall[] = [];
  async function call<T>(
    repository: string,
    action: string,
    options: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const result = await run();
    calls.push({ repository, action, options, result });
    return result;
  }
  const itemName = 'repositoryExampleOrderItems';
  const orderName = 'repositoryExampleOrders';
  const productName = 'repositoryExampleProducts';
  const customerName = 'repositoryExampleCustomers';
  const items = api.repository<Record<string, unknown>>(itemName);
  const filter: RemoteFilterAst | undefined =
    query.status === 'all'
      ? undefined
      : {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'condition',
                path: ['order', 'status'],
                operator: '$eq',
                value: query.status,
              },
            ],
          },
        };
  const expressions: RemoteAggregateAst = {
    kind: 'aggregate',
    version: 1,
    items: [
      { kind: 'count', alias: 'count' },
      { kind: 'sum', field: 'quantity', alias: 'quantity' },
      { kind: 'avg', field: 'unitPriceCents', alias: 'averagePrice' },
      { kind: 'min', field: 'unitPriceCents', alias: 'minimumPrice' },
      { kind: 'max', field: 'unitPriceCents', alias: 'maximumPrice' },
    ],
  };
  const summaryOptions = { filter, aggregate: expressions };
  const summary = await call(itemName, 'aggregate', summaryOptions, () =>
    items.aggregate(summaryOptions),
  );
  const statusOptions = {
    by: ['status'] as const,
    ...(query.status === 'all' ? {} : { filter: { status: query.status } }),
    aggregate: {
      kind: 'aggregate',
      version: 1,
      items: [{ kind: 'count', alias: 'count' }],
    } satisfies RemoteAggregateAst,
    sort: {
      kind: 'sort',
      version: 1,
      items: [{ kind: 'field', path: ['count'], direction: 'desc' }],
    } as const,
  };
  const statuses = await call(orderName, 'groupBy', statusOptions, () =>
    api.repository(orderName).groupBy(statusOptions),
  );
  const groupOptions = {
    by: ['productId'] as const,
    filter,
    aggregate: { ...expressions, items: expressions.items.slice(0, 3) },
    having: {
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          {
            kind: 'condition',
            path: ['quantity'],
            operator: '$gte',
            value: query.minimumQuantity,
          },
        ],
      },
    } as const,
    sort: {
      kind: 'sort',
      version: 1,
      items: [
        { kind: 'field', path: ['quantity'], direction: 'desc' },
        { kind: 'field', path: ['productId'], direction: 'asc' },
      ],
    } as const,
  };
  const groups = await call(itemName, 'groupBy', groupOptions, () =>
    items.groupBy(groupOptions),
  );
  const products = new Map<string, { id: string; name: string; sku: string }>();
  // Match the HTTP adapter's configured limit without losing product labels.
  for (let offset = 0; offset < groups.length; offset += 100) {
    const options = {
      limit: 100,
      filter: {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'or',
          items: groups.slice(offset, offset + 100).map((row) => ({
            kind: 'condition',
            path: ['id'],
            operator: '$eq',
            value: row.productId,
          })),
        },
      } as const,
    };
    const rows = await call(
      productName,
      'findMany',
      options,
      async () =>
        await api
          .repository<{ id: string; name: string; sku: string }>(productName)
          .findMany(options),
    );
    for (const row of rows) products.set(row.id, row);
  }
  const customerOptions = {
    limit: 50,
    sort: {
      kind: 'sort',
      version: 1,
      items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
    } as const,
    select: {
      kind: 'select',
      version: 1,
      root: {
        kind: 'selection',
        fields: ['id', 'name'],
        includes: [
          {
            kind: 'include',
            relation: 'orders',
            select: { kind: 'selection' },
            result: { kind: 'count' },
            ...(query.status === 'all'
              ? {}
              : { filter: { status: query.status } }),
          },
        ],
      },
    } satisfies RemoteSelectAst,
  };
  const customers = await call(
    customerName,
    'findMany',
    customerOptions,
    async () =>
      await api
        .repository<{ id: string; name: string; orders: number }>(customerName)
        .findMany(customerOptions),
  );
  const scalar = (value: unknown): AggregateScalar =>
    typeof value === 'string' || typeof value === 'number' ? value : null;
  const extra = await loadGroupByExamples(api, query);
  return {
    examples: extra.examples,
    calls: [...calls, ...extra.calls],
    data: {
      summary: {
        count: scalar(summary.count),
        quantity: scalar(summary.quantity),
        averagePrice: scalar(summary.averagePrice),
        minimumPrice: scalar(summary.minimumPrice),
        maximumPrice: scalar(summary.maximumPrice),
      },
      // Presentation order is explicit; enum declaration order is not a SQL sort contract.
      statuses: statuses
        .map((row) => ({
          status: String(row.status),
          count: scalar(row.count),
        }))
        .sort((left, right) => left.status.localeCompare(right.status)),
      products: groups.map((row) => {
        const id = String(row.productId);
        const product = products.get(id);
        return {
          productId: id,
          name: product?.name ?? id,
          sku: product?.sku ?? '',
          count: scalar(row.count),
          quantity: scalar(row.quantity),
          averagePrice: scalar(row.averagePrice),
        };
      }),
      customers,
      customerLimit: 50,
    },
  };
}
