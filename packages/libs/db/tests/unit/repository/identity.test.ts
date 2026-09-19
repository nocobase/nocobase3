import { describe, expect, it } from 'vitest';
import type { CollectionDefinition } from '../../../src/index.js';
import {
  createdRecordSelector,
  recordSelector,
} from '../../../src/repository/internal/identity.js';

describe('Repository record identity', () => {
  it.each([9007199254740993n, '9007199254740993'])(
    'preserves exact generated values beyond safe integers: %s',
    (value) => {
      const collection: CollectionDefinition = {
        fields: [{ name: 'sequence', type: 'bigInt', autoIncrement: true }],
        constraints: [{ type: 'primary', fields: ['sequence'] }],
      };
      expect(createdRecordSelector(collection, {}, [value]).values).toEqual({
        sequence: value,
      });
      expect(recordSelector(collection, { sequence: value }).values).toEqual({
        sequence: value,
      });
    },
  );
  it('preserves string identifiers and does not interpret their names', () => {
    const collection: CollectionDefinition = {
      fields: [{ name: 'id', type: 'string' }],
      constraints: [{ type: 'primary', fields: ['id'] }],
    };
    expect(
      createdRecordSelector(collection, { id: 'account-A' }, [42]).values,
    ).toEqual({ id: 'account-A' });
    expect(() => createdRecordSelector(collection, {}, [42])).toThrow(
      'non-null',
    );
  });

  it('uses insert IDs only for explicitly generated fields of any name', () => {
    const collection: CollectionDefinition = {
      fields: [
        { name: 'tenant', type: 'string' },
        { name: 'sequence', type: 'integer', autoIncrement: true },
      ],
      constraints: [{ type: 'primary', fields: ['tenant', 'sequence'] }],
    };
    expect(
      createdRecordSelector(collection, { tenant: 'A' }, ['9007199254740993'])
        .values,
    ).toEqual({ tenant: 'A', sequence: '9007199254740993' });
    expect(() => createdRecordSelector(collection, {}, [42])).toThrow(
      'non-null',
    );
  });

  it('falls back from null unique values and rejects partial unique constraints', () => {
    const collection: CollectionDefinition = {
      constraints: [
        { type: 'unique', fields: ['email'] },
        { type: 'unique', fields: ['label'], predicate: { active: true } },
        { type: 'unique', fields: ['tenant', 'code'] },
      ],
    };
    expect(
      recordSelector(collection, {
        email: null,
        label: 'A',
        tenant: 'T',
        code: 'C',
      }).fields,
    ).toEqual(['tenant', 'code']);
    expect(() =>
      recordSelector(collection, { email: null, label: 'A' }),
    ).toThrow('non-null');
  });

  it('prefers declared primary constraints without inventing an identity', () => {
    expect(
      recordSelector(
        {
          constraints: [
            { type: 'unique', fields: ['email'] },
            { type: 'primary', fields: ['account'] },
          ],
        },
        { account: 'A', email: 'a@example.com' },
      ).fields,
    ).toEqual(['account']);
    expect(() => recordSelector({}, { id: 1 })).toThrow('non-null');
  });
});
