import {
  buildFindManyOptions,
  type ApiClient,
  type RemoteFindManyOptions,
  type RemoteFindManyOptionsJson,
} from '@nocobase/api-client';

export interface SortExample {
  readonly key: string;
  readonly repository: string;
  readonly builder: string;
  readonly options: RemoteFindManyOptions<Record<string, unknown>>;
  readonly expectedError?: string;
}

const customers = 'repositoryExampleCustomers';
const products = 'repositoryExampleProducts';
const items = 'repositoryExampleOrderItems';
const tasks = 'repositoryExampleRelationTasks';
const productFields: RemoteFindManyOptions<
  Record<string, unknown>
>['select'] = (s) => s.fields('id', 'name', 'unitPriceCents');

export const sortExamples: readonly SortExample[] = [
  {
    key: 'default',
    repository: customers,
    builder:
      "// No sort option: primary keys ascend.\nselect: (s) => s.fields('id', 'name')",
    options: { select: (s) => s.fields('id', 'name') },
  },
  ...(['asc', 'desc'] as const).map((direction): SortExample => ({
    key: direction,
    repository: products,
    builder: `sort: (s) => s.field('unitPriceCents').${direction}()`,
    options: {
      sort: (s) => s.field('unitPriceCents')[direction](),
      select: productFields,
    },
  })),
  {
    key: 'multi',
    repository: items,
    builder:
      "sort: (s) => [s.field('quantity').desc(), s.field('unitPriceCents').asc()]",
    options: {
      sort: (s) => [
        s.field('quantity').desc(),
        s.field('unitPriceCents').asc(),
      ],
      select: (s) => s.fields('id', 'quantity', 'unitPriceCents'),
    },
  },
  ...(['first', 'last'] as const).map((position): SortExample => ({
    key: `nulls-${position}`,
    repository: tasks,
    builder: `sort: (s) => [s.field('assigneeId').asc().${position === 'first' ? 'nullsFirst' : 'nullsLast'}(), s.field('id').asc()]`,
    options: {
      sort: (s) => [
        position === 'first'
          ? s.field('assigneeId').asc().nullsFirst()
          : s.field('assigneeId').asc().nullsLast(),
        s.field('id').asc(),
      ],
      select: (s) => s.fields('id', 'title', 'assigneeId'),
    },
  })),
  {
    key: 'to-one',
    repository: tasks,
    builder:
      "sort: (s) => [s.field('assignee.name').desc().nullsLast(), s.field('id').asc()],\nselect: (s) => s.fields('id', 'title').include('assignee', (a) => a.fields('id', 'name'))",
    options: {
      sort: (s) => [
        s.field('assignee.name').desc().nullsLast(),
        s.field('id').asc(),
      ],
      select: (s) =>
        s
          .fields('id', 'title')
          .include('assignee', (a) => a.fields('id', 'name')),
    },
  },
  {
    key: 'count',
    repository: customers,
    builder:
      "sort: (s) => [s.relation('orders').count().desc(), s.field('id').asc()],\nselect: (s) => s.fields('id', 'name').include('orders', (o) => o.combine({\n  count: o.count(), paidCount: o.filter({ status: 'paid' }).count(),\n}))",
    options: {
      sort: (s) => [s.relation('orders').count().desc(), s.field('id').asc()],
      select: (s) =>
        s.fields('id', 'name').include('orders', (o) =>
          o.combine({
            count: o.count(),
            paidCount: o.filter({ status: 'paid' }).count(),
          }),
        ),
    },
  },
  ...(['sum', 'avg', 'min', 'max'] as const).map((aggregate): SortExample => ({
    key: aggregate,
    repository: products,
    builder: `sort: (s) => [s.relation('items').${aggregate}('quantity').desc().nullsFirst(), s.field('id').asc()],\nselect: (s) => s.fields('id', 'name').include('items', (i) => i.combine({\n  count: i.count(), value: i.${aggregate}('quantity'),\n  records: i.fields('id', 'quantity').sort((s) => s.field('id').asc()).limit(5),\n}))`,
    options: {
      sort: (s) => [
        s.relation('items')[aggregate]('quantity').desc().nullsFirst(),
        s.field('id').asc(),
      ],
      select: (s) =>
        s.fields('id', 'name').include('items', (i) =>
          i.combine({
            count: i.count(),
            value: i[aggregate]('quantity'),
            records: i
              .fields('id', 'quantity')
              .sort((s) => s.field('id').asc())
              .limit(5),
          }),
        ),
    },
  })),
  {
    key: 'include',
    repository: customers,
    builder:
      "sort: (s) => s.field('id').asc(),\nselect: (s) => s.fields('id', 'name').include('orders', (o) =>\n  o.fields('id', 'number').sort((s) => s.field('number').desc()).limit(2))",
    options: {
      sort: (s) => s.field('id').asc(),
      select: (s) =>
        s.fields('id', 'name').include('orders', (o) =>
          o
            .fields('id', 'number')
            .sort((s) => s.field('number').desc())
            .limit(2),
        ),
    },
  },
  {
    key: 'duplicate',
    repository: products,
    expectedError: 'INVALID_SORT',
    builder: "sort: (s) => [s.field('id').asc(), s.field('id').desc()]",
    options: {
      sort: (s) => [s.field('id').asc(), s.field('id').desc()],
      select: productFields,
    },
  },
  {
    key: 'to-many',
    repository: products,
    expectedError: 'INVALID_SORT',
    builder: "sort: (s) => s.field('items.quantity').desc()",
    options: {
      sort: (s) => s.field('items.quantity').desc(),
      select: productFields,
    },
  },
];

/** Use the same public serializer as the HTTP client for the displayed request. */
export function sortExampleRequest(
  example: SortExample,
): RemoteFindManyOptionsJson<Record<string, unknown>> {
  return buildFindManyOptions({ limit: 10, ...example.options });
}

export async function runSortExample(
  api: ApiClient,
  example: SortExample,
): Promise<Record<string, unknown>[]> {
  return await api
    .repository(example.repository)
    .findMany({ limit: 10, ...example.options });
}
