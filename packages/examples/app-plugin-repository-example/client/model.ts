import type { ApiClient, RemoteRepository } from '@nocobase/app-client';
import type { RemoteFilterAst, RemoteSelectAst } from '@nocobase/api-client';

export type EntityKey =
  'customers' | 'contacts' | 'products' | 'orders' | 'items';
export interface ExampleRecord {
  readonly id: string;
  readonly version?: number;
  readonly [key: string]: unknown;
}
export type MutationValues = Record<
  string,
  string | number | { connect: { id: string } } | { create: MutationValues[] }
>;
export interface Field {
  readonly key: string;
  readonly kind?: 'email' | 'number';
  readonly min?: number;
  readonly options?: readonly string[];
  readonly relation?: { readonly name: string; readonly target: EntityKey };
}
export interface Entity {
  readonly key: EntityKey;
  readonly repository: string;
  readonly labelField: string;
  readonly singularLabel: string;
  readonly fields: readonly Field[];
  readonly relations: readonly {
    readonly name: string;
    readonly target: EntityKey;
    readonly many?: boolean;
  }[];
}
export const entities: Readonly<Record<EntityKey, Entity>> = {
  customers: {
    key: 'customers',
    singularLabel: 'customer',
    repository: 'repositoryExampleCustomers',
    labelField: 'name',
    fields: [
      { key: 'name' },
      { key: 'company' },
      { key: 'email', kind: 'email' },
      { key: 'status', options: ['lead', 'active', 'inactive'] },
    ],
    relations: [
      { name: 'contacts', target: 'contacts', many: true },
      { name: 'orders', target: 'orders', many: true },
    ],
  },
  contacts: {
    key: 'contacts',
    singularLabel: 'contact',
    repository: 'repositoryExampleContacts',
    labelField: 'name',
    fields: [
      { key: 'name' },
      { key: 'email', kind: 'email' },
      { key: 'phone' },
      {
        key: 'customerId',
        relation: { name: 'customer', target: 'customers' },
      },
    ],
    relations: [{ name: 'customer', target: 'customers' }],
  },
  products: {
    key: 'products',
    singularLabel: 'product',
    repository: 'repositoryExampleProducts',
    labelField: 'name',
    fields: [
      { key: 'name' },
      { key: 'sku' },
      { key: 'unitPriceCents', kind: 'number', min: 0 },
    ],
    relations: [{ name: 'items', target: 'items', many: true }],
  },
  orders: {
    key: 'orders',
    singularLabel: 'order',
    repository: 'repositoryExampleOrders',
    labelField: 'number',
    fields: [
      { key: 'number' },
      { key: 'status', options: ['draft', 'confirmed', 'paid', 'cancelled'] },
      {
        key: 'customerId',
        relation: { name: 'customer', target: 'customers' },
      },
    ],
    relations: [
      { name: 'customer', target: 'customers' },
      { name: 'items', target: 'items', many: true },
    ],
  },
  items: {
    key: 'items',
    singularLabel: 'orderItem',
    repository: 'repositoryExampleOrderItems',
    labelField: 'id',
    fields: [
      { key: 'orderId', relation: { name: 'order', target: 'orders' } },
      { key: 'productId', relation: { name: 'product', target: 'products' } },
      { key: 'quantity', kind: 'number', min: 1 },
      { key: 'unitPriceCents', kind: 'number', min: 0 },
    ],
    relations: [
      { name: 'order', target: 'orders' },
      { name: 'product', target: 'products' },
    ],
  },
};
export function repository(
  api: ApiClient,
  key: EntityKey,
): RemoteRepository<ExampleRecord, MutationValues, MutationValues> {
  return api.repository<ExampleRecord, MutationValues, MutationValues>(
    entities[key].repository,
  );
}
export function searchFilter(
  entity: Entity,
  value: string,
): RemoteFilterAst | undefined {
  return value.trim()
    ? {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'condition',
              path: [entity.labelField],
              operator: '$includes',
              value: value.trim(),
            },
          ],
        },
      }
    : undefined;
}
export function detailSelect(
  entity: Entity,
  includeMany = true,
): RemoteSelectAst {
  return {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: [
        'id',
        ...entity.fields.map((field) => field.key),
        ...(entity.key === 'orders' ? ['version'] : []),
      ],
      includes: entity.relations
        .filter((relation) => includeMany || !relation.many)
        .map((relation) => ({
          kind: 'include',
          relation: relation.name,
          select: {
            kind: 'selection',
            fields: [
              'id',
              ...entities[relation.target].fields.map((field) => field.key),
            ],
            ...(relation.target === 'items'
              ? {
                  includes: [
                    {
                      kind: 'include',
                      relation: 'product',
                      select: {
                        kind: 'selection',
                        fields: ['id', 'name', 'sku', 'unitPriceCents'],
                      },
                    },
                  ],
                }
              : {}),
          },
        })),
    },
  };
}
export function mutationValues(
  entity: Entity,
  values: Readonly<Record<string, string>>,
): MutationValues {
  return Object.fromEntries(
    entity.fields.map((field) => [
      field.relation?.name ?? field.key,
      field.relation
        ? { connect: { id: values[field.key] ?? '' } }
        : field.kind === 'number'
          ? Number(values[field.key])
          : (values[field.key] ?? '').trim(),
    ]),
  );
}
export async function loadChoices(
  api: ApiClient,
  key: EntityKey,
): Promise<ExampleRecord[]> {
  const result: ExampleRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await repository(api, key).findMany({
      limit: 100,
      offset,
      sort: {
        kind: 'sort',
        version: 1,
        items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
      },
    });
    result.push(...page);
    if (page.length < 100) return result;
  }
}

export const entityPaths: Readonly<Record<EntityKey, string>> = {
  customers: '/repository-example/crm',
  contacts: '/repository-example/crm/contacts',
  orders: '/repository-example/orders',
  items: '/repository-example/orders/items',
  products: '/repository-example/orders/products',
};
export function detailPath(key: EntityKey, id: string): string {
  return `${entityPaths[key]}/details/${encodeURIComponent(id)}`;
}
