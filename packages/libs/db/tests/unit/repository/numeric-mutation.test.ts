import { expect, it, expectTypeOf } from 'vitest';
import type {
  CollectionDefinition,
  FieldDefinition,
  Repository,
  NumericMutationBuilder,
} from '../../../src/index.js';
import { normalizeNumericMutation } from '../../../src/repository/numeric-mutation.js';

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

function typedAtomicUpdates(
  repository: Repository<{ id: number; balance: number; enabled: boolean }>,
): void {
  void repository.updateOne({
    filter: { id: 1 },
    values: {
      balance: (value) => {
        expectTypeOf(value).toEqualTypeOf<NumericMutationBuilder>();
        return value.increment(1);
      },
    },
  });
  void repository.updateMany({
    all: true,
    values: { balance: (value) => value.multiply(2) },
  });
  void repository.updateOne({
    filter: { id: 1 },
    // @ts-expect-error Boolean fields do not accept numeric operations.
    values: { enabled: { increment: 1 } },
  });
}

it('exposes contextual numeric Builder types', () => {
  expect(typedAtomicUpdates).toBeTypeOf('function');
});
