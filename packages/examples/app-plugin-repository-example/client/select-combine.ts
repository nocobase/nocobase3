import type { ApiClient, RemoteFindManyOptions } from '@nocobase/api-client';
import type {
  FilterAst,
  RelationSelectBranchNode,
  SelectIncludeNode,
  SortAst,
} from '@nocobase/db';

export interface CombineExample {
  readonly key: 'preview' | 'statistics' | 'nested' | 'scoped' | 'tags';
  readonly repository: string;
  readonly options: RemoteFindManyOptions<Record<string, unknown>>;
}

const byId: SortAst = {
  kind: 'sort',
  version: 1,
  items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
};
function equals(field: string, value: string | null): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [{ kind: 'condition', path: [field], operator: '$eq', value }],
    },
  };
}
function count(field?: string): RelationSelectBranchNode {
  return {
    select: { kind: 'selection' },
    result: { kind: 'count', ...(field ? { field } : {}) },
  };
}
function metric(
  kind: 'sum' | 'avg' | 'min' | 'max',
  field: string,
): RelationSelectBranchNode {
  return { select: { kind: 'selection' }, result: { kind, field } };
}
function records(
  fields: readonly string[],
  limit: number,
): RelationSelectBranchNode {
  return { select: { kind: 'selection', fields }, sort: byId, limit };
}
function combine(
  relation: string,
  branches: Readonly<Record<string, RelationSelectBranchNode>>,
): SelectIncludeNode {
  return {
    kind: 'include',
    relation,
    select: { kind: 'selection' },
    result: { kind: 'combine', branches },
  };
}
function example(
  key: CombineExample['key'],
  repository: string,
  fields: readonly string[],
  include: SelectIncludeNode,
): CombineExample {
  return {
    key,
    repository,
    options: {
      limit: 10,
      sort: byId,
      select: {
        kind: 'select',
        version: 1,
        root: { kind: 'selection', fields, includes: [include] },
      },
    },
  };
}

/** JSON ASTs are sent unchanged through the Repository HTTP client. */
export const combineExamples: readonly CombineExample[] = [
  example(
    'preview',
    'repositoryExampleCustomers',
    ['id', 'name'],
    combine('orders', {
      preview: records(['id', 'number', 'status'], 1),
      total: count(),
      paid: { ...count(), filter: equals('status', 'paid') },
      cancelled: {
        ...records(['id', 'number'], 2),
        filter: equals('status', 'cancelled'),
      },
    }),
  ),
  example(
    'statistics',
    'repositoryExampleOrders',
    ['id', 'number'],
    combine('items', {
      records: records(['id', 'quantity', 'unitPriceCents'], 2),
      count: count(),
      quantity: metric('sum', 'quantity'),
      averagePrice: metric('avg', 'unitPriceCents'),
      minimumPrice: metric('min', 'unitPriceCents'),
      maximumPrice: metric('max', 'unitPriceCents'),
    }),
  ),
  example(
    'nested',
    'repositoryExampleCustomers',
    ['id', 'name'],
    combine('orders', {
      records: {
        ...records(['id', 'number'], 2),
        select: {
          kind: 'selection',
          fields: ['id', 'number'],
          includes: [
            combine('items', {
              preview: {
                ...records(['id', 'quantity'], 1),
                select: {
                  kind: 'selection',
                  fields: ['id', 'quantity'],
                  includes: [
                    {
                      kind: 'include',
                      relation: 'product',
                      select: { kind: 'selection', fields: ['id', 'name'] },
                    },
                  ],
                },
              },
              count: count(),
              quantity: metric('sum', 'quantity'),
            }),
          ],
        },
      },
      count: count(),
    }),
  ),
  example('scoped', 'repositoryExampleRelationProjects', ['id', 'name'], {
    ...combine('tasks', {
      preview: records(['id', 'title', 'assigneeId'], 1),
      total: count(),
      assigned: count('assigneeId'),
      unassigned: {
        ...records(['id', 'title'], 10),
        filter: equals('assigneeId', null),
      },
    }),
    filter: equals('status', 'draft'),
  }),
  example(
    'tags',
    'repositoryExampleRelationProjects',
    ['id', 'name'],
    combine('tags', {
      records: records(['id', 'label'], 10),
      total: count(),
      documentation: { ...count(), filter: equals('label', 'Documentation') },
    }),
  ),
];

export async function runCombineExample(
  api: ApiClient,
  definition: CombineExample,
): Promise<Record<string, unknown>[]> {
  return await api
    .repository(definition.repository)
    .findMany(definition.options);
}
