import { describe, expect, it } from 'vitest';
import { extractLegacyCollectionMetadata } from '../../../src/metadata/legacy-extraction.js';

describe('extractLegacyCollectionMetadata', () => {
  it('extracts only supplemental collection, field, and relation metadata', () => {
    const result = extractLegacyCollectionMetadata({
      name: 'orders',
      title: 'Orders',
      description: 'Customer purchase orders.',
      kind: 'table',
      db: { schema: 'public', comment: 'Physical comment' },
      fields: [
        {
          name: 'id',
          type: 'increments',
          primaryKey: true,
          autoIncrement: true,
        },
        {
          name: 'amount',
          type: 'decimal',
          nullable: false,
          precision: 12,
          scale: 2,
          title: 'Amount',
          description: 'Total before refunds.',
        },
        {
          name: 'customer',
          type: 'belongsTo',
          target: 'customers',
          sourceKey: 'id',
          targetKey: 'id',
          foreignKey: 'customerId',
          foreignKeyType: 'bigInt',
          otherKey: 'orderId',
          through: 'customerOrders',
          constraints: true,
          onDelete: 'cascade',
          title: 'Customer',
          description: 'The customer that placed the order.',
        },
      ],
      indexes: [{ name: 'idx_orders_amount', fields: ['amount'] }],
      constraints: [{ type: 'primary', fields: ['id'] }],
    });

    expect(result).toEqual({
      document: {
        version: 1,
        name: 'orders',
        title: 'Orders',
        description: 'Customer purchase orders.',
        fields: {
          amount: {
            title: 'Amount',
            description: 'Total before refunds.',
          },
        },
        relations: {
          customer: {
            type: 'belongsTo',
            target: 'customers',
            sourceKey: 'id',
            targetKey: 'id',
            foreignKey: 'customerId',
            otherKey: 'orderId',
            through: 'customerOrders',
            title: 'Customer',
            description: 'The customer that placed the order.',
          },
        },
      },
      diagnostics: [],
    });
  });

  it('preserves collection naming and accepts compatible legacy mappings', () => {
    const result = extractLegacyCollectionMetadata(
      {
        name: 'orderItems',
        tableName: 'tbl_orderItems',
        naming: { underscored: false },
        fields: [
          {
            name: 'orderNo',
            columnName: 'orderNo',
            type: 'string',
            title: 'Order number',
          },
        ],
      },
      { naming: { underscored: true, tablePrefix: 'tbl_' } },
    );

    expect(result.document).toEqual({
      version: 1,
      name: 'orderItems',
      naming: { underscored: false },
      fields: { orderNo: { title: 'Order number' } },
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('warns when removed application metadata is discarded', () => {
    const result = extractLegacyCollectionMetadata({
      name: 'orders',
      writable: false,
      fields: [
        {
          name: 'amount',
          type: 'decimal',
          title: 'Amount',
          interface: 'number',
          uiSchema: { component: 'InputNumber' },
        },
      ],
    });

    expect(result.document).toEqual({
      version: 1,
      name: 'orders',
      fields: { amount: { title: 'Amount' } },
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'LEGACY_METADATA_PROPERTY_REMOVED',
        path: ['writable'],
      }),
      expect.objectContaining({
        severity: 'warning',
        path: ['fields', 0, 'interface'],
      }),
      expect.objectContaining({
        severity: 'warning',
        path: ['fields', 0, 'uiSchema'],
      }),
    ]);
  });

  it('returns blocking diagnostics for virtual fields', () => {
    const result = extractLegacyCollectionMetadata({
      name: 'orders',
      fields: [
        { name: 'displayLabel', type: 'virtual', title: 'Display label' },
      ],
    });

    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'LEGACY_METADATA_VIRTUAL_FIELD_UNSUPPORTED',
        path: ['fields', 0],
      }),
    );
  });

  it('returns blocking diagnostics for invalid relations and duplicate names', () => {
    const result = extractLegacyCollectionMetadata({
      name: 'orders',
      fields: [
        { name: 'customer', type: 'belongsTo' },
        { name: 'customer', type: 'string', title: 'Customer' },
        { name: 'owner', type: 'relation', target: 'users' },
      ],
    });

    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'LEGACY_METADATA_INVALID',
          path: ['fields', 0, 'target'],
        }),
        expect.objectContaining({
          severity: 'error',
          path: ['fields', 1, 'name'],
        }),
        expect.objectContaining({
          severity: 'error',
          path: ['fields', 2, 'type'],
        }),
      ]),
    );
  });

  it('rejects incompatible legacy physical mappings', () => {
    const result = extractLegacyCollectionMetadata(
      {
        name: 'orderItems',
        tableName: 'legacy_orders',
        fields: [
          {
            name: 'orderNo',
            columnName: 'legacy_order_number',
            type: 'string',
          },
        ],
      },
      { naming: { tablePrefix: 'tbl_' } },
    );

    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE',
          path: ['tableName'],
        }),
        expect.objectContaining({
          code: 'LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE',
          path: ['fields', 0, 'columnName'],
        }),
      ]),
    );
  });

  it('does not produce empty field metadata or mutate the legacy input', () => {
    const input = {
      name: 'orders',
      fields: [{ name: 'id', type: 'increments', primaryKey: true }],
    };
    const before = structuredClone(input);

    const result = extractLegacyCollectionMetadata(input);

    expect(result.document).toEqual({ version: 1, name: 'orders' });
    expect(input).toEqual(before);
  });

  it('extracts special field names without changing object prototypes', () => {
    const result = extractLegacyCollectionMetadata({
      name: 'orders',
      fields: [
        { name: '__proto__', type: 'string', title: 'Prototype field' },
        { name: 'constructor', type: 'string', title: 'Constructor field' },
      ],
    });

    expect(Object.getPrototypeOf(result.document?.fields)).toBe(
      Object.prototype,
    );
    expect(Object.hasOwn(result.document?.fields ?? {}, '__proto__')).toBe(
      true,
    );
    expect(result.document?.fields?.__proto__).toEqual({
      title: 'Prototype field',
    });
    expect(result.document?.fields?.constructor).toEqual({
      title: 'Constructor field',
    });
  });
});
