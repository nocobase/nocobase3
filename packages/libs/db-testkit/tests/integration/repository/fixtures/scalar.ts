import { type IntegrationTestContext } from '../../helpers.js';

export async function createOrders(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollection('repositoryOrders', (collection) => {
    collection.increments('id');
    collection.string('orderNo').notNull().unique();
    collection.string('status').notNull();
    collection.integer('amount').notNull();
    collection.string('note').nullable();
    collection.boolean('enabled').nullable();
    collection.integer('version').notNull();
    collection.optimisticLock('version');
  });
}

export function selection(fields: readonly string[]): {
  readonly kind: 'select';
  readonly version: 1;
  readonly root: {
    readonly kind: 'selection';
    readonly fields: readonly string[];
  };
} {
  return {
    kind: 'select' as const,
    version: 1 as const,
    root: { kind: 'selection' as const, fields },
  };
}

export function sorting(
  field: string,
  direction: 'asc' | 'desc',
): {
  readonly kind: 'sort';
  readonly version: 1;
  readonly items: readonly [
    {
      readonly kind: 'field';
      readonly path: readonly [string];
      readonly direction: 'asc' | 'desc';
    },
  ];
} {
  return {
    kind: 'sort' as const,
    version: 1 as const,
    items: [{ kind: 'field' as const, path: [field] as const, direction }],
  };
}
