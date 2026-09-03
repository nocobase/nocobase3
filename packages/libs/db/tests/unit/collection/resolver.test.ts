import { describe, expect, it, vi } from 'vitest';
import { CollectionResolutionError } from '../../../src/collection/resolver/errors.js';
import {
  CollectionResolver,
  resolveCollection,
} from '../../../src/collection/resolver/resolver.js';
import type { CollectionResolutionContext } from '../../../src/collection/resolver/types.js';
import type { CollectionMetadataDocument } from '../../../src/index.js';
import type {
  PhysicalCollectionSchema,
  PhysicalSchemaAspect,
  PhysicalSchemaInspectionStatus,
} from '../../../src/schema/inspector/types.js';

describe('CollectionResolver', () => {
  it('maps physical facts and supplemental metadata without duplicating constraints', () => {
    const context: CollectionResolutionContext = {
      resolvePhysicalCollection: vi.fn((identity) =>
        identity.schema === 'crm' && identity.tableName === 'crm_customers'
          ? {
              name: 'customers',
              naming: { underscored: true, tablePrefix: 'crm_' },
            }
          : undefined,
      ),
    };
    const physical = physicalCollection({
      kind: 'partitionedTable',
      schema: 'sales',
      tableName: 'app_orders',
      comment: 'Physical orders',
      columns: [
        column('normalized_email', 4, {
          dataType: 'string',
          nativeType: 'varchar(255)',
          length: 255,
          generated: { expression: 'lower(email)', stored: true },
        }),
        column('id', 1, {
          dataType: 'bigInt',
          nativeType: 'int8',
          nativeTypeSchema: 'pg_catalog',
          autoIncrement: true,
        }),
        column('customer_id', 2, {
          dataType: 'bigInt',
          nativeType: 'int8',
          nullable: false,
        }),
        column('amount', 3, {
          dataType: 'decimal',
          nativeType: 'numeric(12,2)',
          precision: 12,
          scale: 2,
          default: { expression: '0::numeric', value: 0 },
          comment: 'Physical amount',
        }),
      ],
      primaryKey: { name: 'orders_pkey', columns: ['id'] },
      uniqueConstraints: [
        {
          name: 'orders_amount_key',
          columns: ['amount'],
          deferrable: true,
          initiallyDeferred: true,
        },
      ],
      indexes: [
        {
          name: 'orders_pkey',
          keys: [{ columnName: 'id' }],
          unique: true,
          backsConstraint: { kind: 'primaryKey', name: 'orders_pkey' },
        },
        {
          name: 'orders_search_idx',
          keys: [
            { columnName: 'customer_id', order: 'desc', nulls: 'last' },
            { expression: 'lower(normalized_email)', order: 'asc' },
          ],
          includeColumns: ['amount'],
          unique: true,
          method: 'btree',
          predicate: 'amount > 0',
        },
      ],
      foreignKeys: [
        {
          name: 'orders_customer_fkey',
          columns: ['customer_id'],
          referencedCollection: {
            schema: 'crm',
            tableName: 'crm_customers',
          },
          referencedColumns: ['id'],
          onDelete: 'setNull',
          onUpdate: 'setDefault',
          deferrable: true,
          initiallyDeferred: false,
        },
      ],
      checkConstraints: [
        { name: 'orders_amount_check', expression: 'amount >= 0' },
      ],
      inspection: inspection({ comments: 'unsupported' }, [
        {
          code: 'COMMENTS_UNSUPPORTED',
          aspect: 'comments',
          message: 'Comments are not available.',
        },
      ]),
    });
    const metadata: CollectionMetadataDocument = {
      version: 1,
      name: 'orders',
      naming: { tablePrefix: 'app_' },
      title: 'Orders',
      fields: {
        amount: { title: 'Amount', description: 'Order total.' },
      },
      relations: {
        customer: {
          type: 'belongsTo',
          target: 'customers',
          sourceKey: 'id',
          title: 'Customer',
        },
      },
    };

    const result = new CollectionResolver().resolve({
      physical,
      metadata,
      naming: { underscored: true, tablePrefix: 'ignored_' },
      context,
    });

    expect(context.resolvePhysicalCollection).toHaveBeenCalledWith({
      schema: 'crm',
      tableName: 'crm_customers',
    });
    expect(result.collection).toMatchObject({
      kind: 'table',
      name: 'orders',
      naming: { underscored: true, tablePrefix: 'app_' },
      title: 'Orders',
      db: {
        schema: 'sales',
        comment: 'Physical orders',
        physicalKind: 'partitionedTable',
      },
    });
    expect(result.collection.fields?.map((field) => field.name)).toEqual([
      'id',
      'customerId',
      'amount',
      'normalizedEmail',
      'customer',
    ]);
    expect(
      result.collection.fields?.find((field) => field.name === 'id'),
    ).toMatchObject({
      type: 'bigInt',
      nullable: true,
      autoIncrement: true,
      db: { nativeType: 'int8', nativeTypeSchema: 'pg_catalog' },
    });
    expect(
      result.collection.fields?.find((field) => field.name === 'amount'),
    ).toMatchObject({
      type: 'decimal',
      defaultValue: 0,
      precision: 12,
      scale: 2,
      title: 'Amount',
      description: 'Order total.',
      db: {
        nativeType: 'numeric(12,2)',
        comment: 'Physical amount',
        defaultExpression: '0::numeric',
      },
    });
    expect(
      result.collection.fields?.find(
        (field) => field.name === 'normalizedEmail',
      ),
    ).toMatchObject({
      db: { generated: { expression: 'lower(email)', stored: true } },
    });
    expect(
      result.collection.fields?.find((field) => field.name === 'customer'),
    ).toMatchObject({
      type: 'belongsTo',
      target: 'customers',
      sourceKey: 'id',
      foreignKey: 'customerId',
      title: 'Customer',
    });
    expect(result.collection.constraints).toEqual([
      { type: 'primary', name: 'orders_pkey', fields: ['id'] },
      {
        type: 'unique',
        name: 'orders_amount_key',
        fields: ['amount'],
        deferrable: 'deferred',
      },
      {
        type: 'foreignKey',
        name: 'orders_customer_fkey',
        fields: ['customerId'],
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'set null',
        onUpdate: 'set default',
        deferrable: 'immediate',
      },
      {
        type: 'check',
        name: 'orders_amount_check',
        expression: 'amount >= 0',
      },
    ]);
    expect(result.collection.indexes).toEqual([
      {
        name: 'orders_search_idx',
        fields: ['customerId'],
        expressions: ['lower(normalized_email)'],
        type: 'btree',
        order: { customerId: 'desc' },
        db: {
          unique: true,
          keys: [
            { field: 'customerId', order: 'desc', nulls: 'last' },
            { expression: 'lower(normalized_email)', order: 'asc' },
          ],
          includeFields: ['amount'],
          predicate: 'amount > 0',
        },
      },
    ]);
    expect(result.inspection).toBe(physical.inspection);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'COLLECTION_INSPECTION_UNSUPPORTED',
        aspect: 'comments',
      }),
      {
        code: 'COLLECTION_INSPECTION_WARNING',
        sourceCode: 'COMMENTS_UNSUPPORTED',
        aspect: 'comments',
        message: 'Comments are not available.',
      },
    ]);
  });

  it('infers deterministic names without metadata and preserves a complete View definition', () => {
    const result = resolveCollection({
      physical: physicalCollection({
        kind: 'view',
        tableName: 'app_active_orders',
        columns: [column('order_no', 1)],
        viewDefinition: 'select order_no from app_orders',
      }),
      naming: { tablePrefix: 'app_' },
      context: emptyContext(),
    });

    expect(result.collection).toMatchObject({
      kind: 'view',
      name: 'activeOrders',
      fields: [{ name: 'orderNo' }],
      view: { asRaw: { sql: 'select order_no from app_orders' } },
    });
  });

  it('keeps partial non-column facts as warnings without guessing missing facts', () => {
    const result = resolveCollection({
      physical: physicalCollection({
        tableName: 'orders',
        columns: [column('id', 1)],
        inspection: inspection({ indexes: 'partial' }),
      }),
      context: emptyContext(),
    });

    expect(result.collection.name).toBe('orders');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'COLLECTION_INSPECTION_PARTIAL',
        aspect: 'indexes',
      }),
    );
  });

  it('preserves physical identifiers when underscored naming is disabled', () => {
    const result = resolveCollection({
      physical: physicalCollection({
        tableName: 'tbl_order_items',
        columns: [column('order_no', 1)],
      }),
      naming: { underscored: false, tablePrefix: 'tbl_' },
      context: emptyContext(),
    });

    expect(result.collection.name).toBe('order_items');
    expect(result.collection.fields?.[0]?.name).toBe('order_no');
  });

  it('aggregates incomplete columns, drift, naming, relation, and physical reference issues', () => {
    const physical = physicalCollection({
      tableName: 'wrong_orders',
      columns: [column('customer_id', 1)],
      primaryKey: { columns: ['missing_id'] },
      indexes: [
        {
          name: 'bad_index',
          keys: [{ columnName: 'missing_column' }],
          unique: false,
        },
      ],
      foreignKeys: [
        {
          columns: ['customer_id'],
          referencedCollection: { schema: 'crm', tableName: 'customers' },
          referencedColumns: ['id'],
        },
      ],
      inspection: inspection({ columns: 'partial' }),
    });
    const metadata: CollectionMetadataDocument = {
      version: 1,
      name: 'orders',
      fields: { missing: { title: 'Missing' } },
      relations: {
        customerId: { type: 'belongsTo', target: 'customers' },
        owner: {
          type: 'belongsTo',
          target: 'users',
          sourceKey: 'missingSource',
          foreignKey: 'missingForeignKey',
        },
      },
    };

    expect(() =>
      resolveCollection({ physical, metadata, context: emptyContext() }),
    ).toThrow(CollectionResolutionError);

    try {
      resolveCollection({ physical, metadata, context: emptyContext() });
    } catch (error) {
      const codes = (error as CollectionResolutionError).issues.map(
        (item) => item.code,
      );
      expect(codes).toEqual(
        expect.arrayContaining([
          'COLLECTION_SCHEMA_INCOMPLETE',
          'COLLECTION_SCHEMA_DRIFT',
          'COLLECTION_FIELD_CONFLICT',
          'COLLECTION_RELATION_INVALID',
          'COLLECTION_PHYSICAL_REFERENCE_INVALID',
        ]),
      );
    }
  });

  it('rejects physical identifiers that cannot round trip through naming', () => {
    expect(() =>
      resolveCollection({
        physical: physicalCollection({
          tableName: 'Orders',
          columns: [column('ID', 1)],
        }),
        context: emptyContext(),
      }),
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'COLLECTION_NAME_CONFLICT' }),
        ]),
      }),
    );
  });

  it('rejects inconsistent target identities and foreign key column counts', () => {
    const physical = physicalCollection({
      columns: [column('tenant_id', 1), column('customer_id', 2)],
      foreignKeys: [
        {
          columns: ['tenant_id', 'customer_id'],
          referencedCollection: {
            schema: 'crm',
            tableName: 'crm_customers',
          },
          referencedColumns: ['id'],
        },
      ],
    });

    expect(() =>
      resolveCollection({
        physical,
        context: {
          resolvePhysicalCollection: () => ({
            name: 'accounts',
            naming: { underscored: true, tablePrefix: 'crm_' },
          }),
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'COLLECTION_PHYSICAL_REFERENCE_INVALID',
            message: expect.stringContaining('local columns'),
          }),
          expect.objectContaining({
            code: 'COLLECTION_PHYSICAL_REFERENCE_INVALID',
            message: expect.stringContaining('does not map'),
          }),
        ]),
      }),
    );
  });
});

function physicalCollection(
  overrides: Partial<PhysicalCollectionSchema> = {},
): PhysicalCollectionSchema {
  return {
    schema: 'public',
    tableName: 'orders',
    kind: 'table',
    columns: [],
    uniqueConstraints: [],
    indexes: [],
    foreignKeys: [],
    checkConstraints: [],
    inspection: inspection(),
    ...overrides,
  };
}

function column(
  columnName: string,
  ordinalPosition: number,
  overrides: Partial<PhysicalCollectionSchema['columns'][number]> = {},
): PhysicalCollectionSchema['columns'][number] {
  return {
    columnName,
    ordinalPosition,
    dataType: 'string',
    nativeType: 'varchar(255)',
    nullable: true,
    autoIncrement: false,
    ...overrides,
  };
}

function inspection(
  overrides: Partial<
    Record<PhysicalSchemaAspect, PhysicalSchemaInspectionStatus>
  > = {},
  warnings: PhysicalCollectionSchema['inspection']['warnings'] = [],
): PhysicalCollectionSchema['inspection'] {
  return {
    aspects: {
      columns: 'complete',
      primaryKey: 'complete',
      uniqueConstraints: 'complete',
      indexes: 'complete',
      foreignKeys: 'complete',
      checkConstraints: 'complete',
      comments: 'complete',
      viewDefinition: 'complete',
      ...overrides,
    },
    warnings,
  };
}

function emptyContext(): CollectionResolutionContext {
  return { resolvePhysicalCollection: () => undefined };
}
