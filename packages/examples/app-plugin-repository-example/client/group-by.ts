import type { ApiClient, RemoteGroupByOptions } from '@nocobase/api-client';
import type { AggregateRequest } from '../shared/aggregate.js';
import type { AggregateCall } from './aggregate.js';

export interface GroupByExampleRow {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
  readonly price?: number | string | null;
  readonly count: number | string | null;
  readonly quantity?: number | string | null;
}
export interface GroupByExample {
  readonly key: 'customerRanking' | 'customerStatus' | 'productPrice';
  readonly target: 'customers' | 'products';
  readonly rows: readonly GroupByExampleRow[];
  readonly call: AggregateCall;
}

/** Each panel executes a real groupBy request; lookups only label returned keys. */
export async function loadGroupByExamples(
  api: ApiClient,
  query: AggregateRequest,
): Promise<{ examples: GroupByExample[]; calls: AggregateCall[] }> {
  const calls: AggregateCall[] = [];
  const count = {
    kind: 'aggregate',
    version: 1,
    items: [{ kind: 'count', alias: 'count' }],
  } as const;
  const having = {
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
          value: query.minimumGroupCount ?? 1,
        },
      ],
    },
  } as const;
  const statusFilter =
    query.status === 'all' ? undefined : { status: query.status };
  const examples: GroupByExample[] = [];
  const definitions: readonly {
    key: GroupByExample['key'];
    target: GroupByExample['target'];
    repository: string;
    keyField: string;
    options: RemoteGroupByOptions<Record<string, unknown>>;
  }[] = [
    {
      key: 'customerRanking',
      target: 'customers',
      repository: 'repositoryExampleOrders',
      keyField: 'customerId',
      options: {
        by: ['customerId'],
        filter: statusFilter,
        aggregate: count,
        having,
        sort: {
          kind: 'sort',
          version: 1,
          items: [
            { kind: 'field', path: ['count'], direction: 'desc' },
            { kind: 'field', path: ['customerId'], direction: 'asc' },
          ],
        },
      },
    },
    {
      key: 'customerStatus',
      target: 'customers',
      repository: 'repositoryExampleOrders',
      keyField: 'customerId',
      options: {
        by: ['customerId', 'status'],
        filter: statusFilter,
        aggregate: count,
        having,
        sort: {
          kind: 'sort',
          version: 1,
          items: [
            { kind: 'field', path: ['count'], direction: 'desc' },
            { kind: 'field', path: ['customerId'], direction: 'asc' },
          ],
        },
      },
    },
    {
      key: 'productPrice',
      target: 'products',
      repository: 'repositoryExampleOrderItems',
      keyField: 'productId',
      options: {
        by: ['productId', 'unitPriceCents'],
        filter:
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
              },
        aggregate: {
          kind: 'aggregate',
          version: 1,
          items: [
            { kind: 'count', alias: 'count' },
            { kind: 'sum', field: 'quantity', alias: 'quantity' },
          ],
        },
        having,
        sort: {
          kind: 'sort',
          version: 1,
          items: [
            { kind: 'field', path: ['quantity'], direction: 'desc' },
            { kind: 'field', path: ['productId'], direction: 'asc' },
            { kind: 'field', path: ['unitPriceCents'], direction: 'asc' },
          ],
        },
      },
    },
  ];
  for (const definition of definitions) {
    const result = await api
      .repository(definition.repository)
      .groupBy(definition.options);
    const call = {
      repository: definition.repository,
      action: 'groupBy',
      options: definition.options,
      result,
    };
    calls.push(call);
    const names = new Map<string, string>();
    const ids = [
      ...new Set(result.map((row) => String(row[definition.keyField]))),
    ];
    const repository =
      definition.target === 'customers'
        ? 'repositoryExampleCustomers'
        : 'repositoryExampleProducts';
    for (let offset = 0; offset < ids.length; offset += 100) {
      const options = {
        limit: 100,
        filter: {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'or',
            items: ids.slice(offset, offset + 100).map((id) => ({
              kind: 'condition',
              path: ['id'],
              operator: '$eq',
              value: id,
            })),
          },
        },
        select: {
          kind: 'select',
          version: 1,
          root: { kind: 'selection', fields: ['id', 'name'] },
        },
      } as const;
      const records = await api
        .repository<{ id: string; name: string }>(repository)
        .findMany(options);
      calls.push({ repository, action: 'findMany', options, result: records });
      for (const record of records) names.set(record.id, record.name);
    }
    const scalar = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number' ? value : null;
    examples.push({
      key: definition.key,
      target: definition.target,
      call,
      rows: result.map((row) => {
        const id = String(row[definition.keyField]);
        return {
          id,
          name: names.get(id) ?? id,
          count: scalar(row.count),
          ...(definition.key === 'customerStatus'
            ? { status: String(row.status) }
            : {}),
          ...(definition.key === 'productPrice'
            ? {
                price: scalar(row.unitPriceCents),
                quantity: scalar(row.quantity),
              }
            : {}),
        };
      }),
    });
  }
  return { examples, calls };
}
