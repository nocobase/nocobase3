import { describe, expect, it } from 'vitest';
import {
  CollectionMetadataValidationError,
  validateCollectionMetadataDocument,
} from '../../../src/index.js';

describe('validateCollectionMetadataDocument', () => {
  it('returns a normalized clone of a complete V1 document', () => {
    const input = {
      version: 1,
      name: 'orders',
      naming: { underscored: true, tablePrefix: '' },
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
    };

    const document = validateCollectionMetadataDocument(input);

    expect(document).toEqual(input);
    expect(document).not.toBe(input);
    expect(document.naming).not.toBe(input.naming);
    expect(document.fields).not.toBe(input.fields);
    expect(document.fields?.amount).not.toBe(input.fields.amount);
    expect(document.relations?.customer).not.toBe(input.relations.customer);

    input.fields.amount.title = 'Changed after validation';
    expect(document.fields?.amount.title).toBe('Amount');
  });

  it('accepts the minimal document and an empty table prefix', () => {
    expect(
      validateCollectionMetadataDocument({
        version: 1,
        name: 'orders',
        naming: { tablePrefix: '' },
      }),
    ).toEqual({
      version: 1,
      name: 'orders',
      naming: { tablePrefix: '' },
    });
  });

  it.each([null, [], new Date(), 'orders'])(
    'rejects a non-plain root object: %s',
    (input) => {
      expect(() => validateCollectionMetadataDocument(input)).toThrow(
        CollectionMetadataValidationError,
      );
    },
  );

  it('reports missing and unsupported versions separately', () => {
    expectIssues({ name: 'orders' }, [
      {
        code: 'COLLECTION_METADATA_REQUIRED',
        path: ['version'],
      },
    ]);
    expectIssues({ version: 2, name: 'orders' }, [
      {
        code: 'COLLECTION_METADATA_VERSION_UNSUPPORTED',
        path: ['version'],
      },
    ]);
  });

  it.each([
    ['', 'empty'],
    [' orders', 'leading whitespace'],
    ['orders ', 'trailing whitespace'],
  ])('rejects an invalid document name (%s: %s)', (name) => {
    expectIssues({ version: 1, name }, [
      {
        code: 'COLLECTION_METADATA_NAME_INVALID',
        path: ['name'],
      },
    ]);
  });

  it('rejects nulls, invalid nested types, and unknown properties', () => {
    expectIssues(
      {
        version: 1,
        name: 'orders',
        title: null,
        titel: 'Typo',
        naming: { underscored: 'yes', unknown: true },
        fields: { amount: null },
        relations: [],
      },
      [
        {
          code: 'COLLECTION_METADATA_UNKNOWN_PROPERTY',
          path: ['titel'],
        },
        {
          code: 'COLLECTION_METADATA_TYPE_INVALID',
          path: ['title'],
        },
        {
          code: 'COLLECTION_METADATA_UNKNOWN_PROPERTY',
          path: ['naming', 'unknown'],
        },
        {
          code: 'COLLECTION_METADATA_TYPE_INVALID',
          path: ['naming', 'underscored'],
        },
        {
          code: 'COLLECTION_METADATA_TYPE_INVALID',
          path: ['fields', 'amount'],
        },
        {
          code: 'COLLECTION_METADATA_TYPE_INVALID',
          path: ['relations'],
        },
      ],
    );
  });

  it('validates field keys and field metadata properties', () => {
    expectIssues(
      {
        version: 1,
        name: 'orders',
        fields: {
          ' amount': { title: 42, nullable: false },
        },
      },
      [
        {
          code: 'COLLECTION_METADATA_NAME_INVALID',
          path: ['fields', ' amount'],
        },
        {
          code: 'COLLECTION_METADATA_UNKNOWN_PROPERTY',
          path: ['fields', ' amount', 'nullable'],
        },
        {
          code: 'COLLECTION_METADATA_TYPE_INVALID',
          path: ['fields', ' amount', 'title'],
        },
      ],
    );
  });

  it('validates relation types, targets, references, and unknown properties', () => {
    expectIssues(
      {
        version: 1,
        name: 'orders',
        relations: {
          customer: {
            type: 'relation',
            target: '',
            foreignKey: ' customerId',
            constraints: true,
          },
        },
      },
      [
        {
          code: 'COLLECTION_METADATA_UNKNOWN_PROPERTY',
          path: ['relations', 'customer', 'constraints'],
        },
        {
          code: 'COLLECTION_METADATA_RELATION_INVALID',
          path: ['relations', 'customer', 'type'],
        },
        {
          code: 'COLLECTION_METADATA_NAME_INVALID',
          path: ['relations', 'customer', 'target'],
        },
        {
          code: 'COLLECTION_METADATA_NAME_INVALID',
          path: ['relations', 'customer', 'foreignKey'],
        },
      ],
    );
  });

  it('rejects names shared by fields and relations', () => {
    expectIssues(
      {
        version: 1,
        name: 'orders',
        fields: { customer: { title: 'Customer ID' } },
        relations: {
          customer: { type: 'belongsTo', target: 'customers' },
        },
      },
      [
        {
          code: 'COLLECTION_METADATA_NAME_CONFLICT',
          path: ['relations', 'customer'],
        },
      ],
    );
  });

  it('preserves special record keys without changing object prototypes', () => {
    const input = JSON.parse(`{
      "version": 1,
      "name": "orders",
      "fields": {
        "__proto__": { "title": "Prototype field" },
        "constructor": { "title": "Constructor field" }
      }
    }`) as unknown;

    const document = validateCollectionMetadataDocument(input);

    expect(Object.getPrototypeOf(document.fields)).toBe(Object.prototype);
    expect(Object.hasOwn(document.fields!, '__proto__')).toBe(true);
    expect(document.fields?.__proto__).toEqual({ title: 'Prototype field' });
    expect(document.fields?.constructor).toEqual({
      title: 'Constructor field',
    });
  });

  it('does not mutate invalid input', () => {
    const input = {
      version: 2,
      name: 'orders',
      fields: { amount: { title: null } },
    };
    const before = structuredClone(input);

    expect(() => validateCollectionMetadataDocument(input)).toThrow();
    expect(input).toEqual(before);
  });
});

function expectIssues(
  input: unknown,
  expected: Array<{ code: string; path: Array<string | number> }>,
): void {
  try {
    validateCollectionMetadataDocument(input);
    throw new Error('Expected metadata validation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(CollectionMetadataValidationError);
    expect(
      (error as CollectionMetadataValidationError).issues.map((item) => ({
        code: item.code,
        path: item.path,
      })),
    ).toEqual(expect.arrayContaining(expected));
  }
}
