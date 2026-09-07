import { expect, it } from 'vitest';
import type {
  CollectionDefinition,
  FieldDefinition,
} from '../../../../src/index.js';
import { normalizeNumericMutation } from '../../../../src/repository/numeric-mutation.js';

const collection: CollectionDefinition = { name: 'accounts' };
const field: FieldDefinition = { name: 'balance', type: 'decimal' };

it('preserves decimal precision, rejects invalid operands, and treats JSON as data', () => {
  expect(
    normalizeNumericMutation(
      collection,
      field,
      { increment: '9007199254740993.125' },
      true,
    ),
  ).toEqual({
    kind: 'numericMutation',
    operation: 'increment',
    value: '9007199254740993.125',
  });
  expect(
    normalizeNumericMutation(
      collection,
      { ...field, type: 'bigInt' },
      { increment: 9007199254740993n },
      true,
    ),
  ).toMatchObject({ value: 9007199254740993n });
  expect(normalizeNumericMutation(collection, field, null, true)).toBeNull();
  expect(
    normalizeNumericMutation(
      collection,
      { ...field, type: 'json' },
      { increment: 1 },
      true,
    ),
  ).toEqual({ increment: 1 });
  for (const input of [
    { divide: '-0.0' },
    { increment: 'NaN' },
    { multiply: '1; DROP TABLE accounts' },
    {},
    { divide: null },
  ]) {
    expect(() =>
      normalizeNumericMutation(collection, field, input, true),
    ).toThrow();
  }
});
