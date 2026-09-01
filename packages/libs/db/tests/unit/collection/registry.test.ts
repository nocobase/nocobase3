import { describe, expect, it } from 'vitest';
import {
  CollectionRegistry,
  CollectionRelationValidationError,
  InMemoryCollectionMetadataStore,
  type PhysicalCollectionIdentifier,
  type PhysicalCollectionPage,
  type PhysicalCollectionSchema,
  type SchemaInspector,
} from '../../../src/index.js';

describe('CollectionRegistry', () => {
  it('deduplicates concurrent loads, caches clones, refreshes, and avoids negative caching', async () => {
    const inspector = new FakeInspector([physical('orders')]);
    const registry = new CollectionRegistry({
      inspector,
      metadataStore: new InMemoryCollectionMetadataStore(),
    });

    const [first, second] = await Promise.all([
      registry.get('orders'),
      registry.get('orders'),
    ]);
    expect(inspector.getCalls).toBe(1);
    first!.fields![0].type = 'text';
    expect(second?.fields?.[0]?.type).toBe('bigInt');
    expect((await registry.get('orders'))?.fields?.[0]?.type).toBe('bigInt');
    expect(inspector.getCalls).toBe(1);

    await registry.refresh('orders');
    expect(inspector.getCalls).toBe(2);

    await expect(registry.get('missing')).resolves.toBeUndefined();
    inspector.schemas.set('missing', physical('missing'));
    await expect(registry.get('missing')).resolves.toBeDefined();
    expect(inspector.getCalls).toBe(4);
  });

  it('does not let an invalidated in-flight result repopulate the cache', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inspector = new FakeInspector([physical('orders')]);
    inspector.beforeGet = async () => gate;
    const registry = new CollectionRegistry({
      inspector,
      metadataStore: new InMemoryCollectionMetadataStore(),
    });

    const loading = registry.get('orders');
    await Promise.resolve();
    registry.invalidate('orders');
    release!();
    await loading;
    inspector.beforeGet = undefined;
    await registry.get('orders');

    expect(inspector.getCalls).toBe(2);
  });

  it('uses Metadata naming overrides and returns lightweight paginated summaries', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.put(
      {
        version: 1,
        name: 'orders',
        naming: { tablePrefix: 'legacy_' },
        title: 'Orders',
        description: 'Sales orders',
      },
      { expectedRevision: null },
    );
    const inspector = new FakeInspector([physical('legacy_orders')]);
    const registry = new CollectionRegistry({
      inspector,
      metadataStore: store,
    });

    expect(await registry.get('orders')).toMatchObject({
      name: 'orders',
      title: 'Orders',
      naming: { tablePrefix: 'legacy_' },
    });
    expect(await registry.list({ limit: 10 })).toEqual({
      items: [
        {
          name: 'orders',
          tableName: 'legacy_orders',
          schema: 'public',
          kind: 'table',
          title: 'Orders',
          description: 'Sales orders',
        },
      ],
    });
  });

  it('reports drift when saved Metadata points at a missing physical Collection', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.put(
      { version: 1, name: 'orders', title: 'Orders' },
      { expectedRevision: null },
    );
    const registry = new CollectionRegistry({
      inspector: new FakeInspector([]),
      metadataStore: store,
    });

    await expect(registry.get('orders')).rejects.toMatchObject({
      code: 'COLLECTION_RESOLUTION_FAILED',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'COLLECTION_SCHEMA_DRIFT' }),
      ]),
    });
  });

  it('scans full Collections explicitly and validates cyclic relation graphs', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.put(
      {
        version: 1,
        name: 'users',
        relations: {
          department: {
            type: 'belongsTo',
            target: 'departments',
            foreignKey: 'departmentId',
          },
        },
      },
      { expectedRevision: null },
    );
    await store.put(
      {
        version: 1,
        name: 'departments',
        relations: {
          owner: {
            type: 'belongsTo',
            target: 'users',
            foreignKey: 'ownerId',
          },
        },
      },
      { expectedRevision: null },
    );
    const registry = new CollectionRegistry({
      inspector: new FakeInspector([
        physical('users', ['id', 'department_id']),
        physical('departments', ['id', 'owner_id']),
      ]),
      metadataStore: store,
    });

    const names: string[] = [];
    for await (const collection of registry.scan())
      names.push(collection.name!);
    expect(names.sort()).toEqual(['departments', 'users']);
    await expect(registry.validateRelations('users')).resolves.toBeUndefined();
  });

  it('aggregates cross-Collection target, targetKey, remote key, and through errors', async () => {
    const store = new InMemoryCollectionMetadataStore();
    await store.put(
      {
        version: 1,
        name: 'orders',
        relations: {
          owner: {
            type: 'belongsTo',
            target: 'missing',
            foreignKey: 'ownerId',
          },
          items: {
            type: 'hasMany',
            target: 'items',
            targetKey: 'missingId',
            foreignKey: 'missingOrderId',
          },
          products: {
            type: 'belongsToMany',
            target: 'products',
            through: 'missingThrough',
          },
        },
      },
      { expectedRevision: null },
    );
    const registry = new CollectionRegistry({
      inspector: new FakeInspector([
        physical('orders', ['id', 'owner_id']),
        physical('items', ['id']),
        physical('products', ['id']),
      ]),
      metadataStore: store,
    });

    await expect(registry.validateRelations('orders')).rejects.toBeInstanceOf(
      CollectionRelationValidationError,
    );
    try {
      await registry.validateRelations('orders');
    } catch (error) {
      expect((error as CollectionRelationValidationError).issues).toHaveLength(
        4,
      );
    }
  });
});

class FakeInspector implements SchemaInspector {
  readonly schemas = new Map<string, PhysicalCollectionSchema>();
  getCalls = 0;
  beforeGet?: () => Promise<void>;

  constructor(schemas: readonly PhysicalCollectionSchema[]) {
    for (const schema of schemas) this.schemas.set(schema.tableName, schema);
  }

  async listSchemas(): Promise<Array<{ name: string; default: boolean }>> {
    return [{ name: 'public', default: true }];
  }

  async getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined> {
    this.getCalls += 1;
    await this.beforeGet?.();
    return structuredClone(this.schemas.get(identifier.tableName));
  }

  async listPhysicalCollections(): Promise<PhysicalCollectionPage> {
    return {
      items: [...this.schemas.values()].map(({ schema, tableName, kind }) => ({
        schema,
        tableName,
        kind,
      })),
    };
  }

  async *scanPhysicalCollections(): AsyncIterable<PhysicalCollectionSchema> {
    for (const schema of this.schemas.values()) yield structuredClone(schema);
  }
}

function physical(
  tableName: string,
  columns: readonly string[] = ['id'],
): PhysicalCollectionSchema {
  return {
    schema: 'public',
    tableName,
    kind: 'table',
    columns: columns.map((columnName, index) => ({
      columnName,
      ordinalPosition: index + 1,
      dataType: 'bigInt',
      nativeType: 'bigint',
      nullable: false,
      autoIncrement: false,
    })),
    primaryKey: columns.includes('id') ? { columns: ['id'] } : undefined,
    uniqueConstraints: [],
    indexes: [],
    foreignKeys: [],
    checkConstraints: [],
    inspection: {
      aspects: {
        columns: 'complete',
        primaryKey: 'complete',
        uniqueConstraints: 'complete',
        indexes: 'complete',
        foreignKeys: 'complete',
        checkConstraints: 'complete',
        comments: 'complete',
        viewDefinition: 'complete',
      },
      warnings: [],
    },
  };
}
