import type {
  CollectionDefinition,
  FieldDefinition,
} from '../collection/types.js';
import { RepositoryError } from './errors.js';
import { isTemporalType, normalizeTemporalValue } from './temporal.js';
import { resolveMutationValue } from './values.js';
import type {
  NumericMutationBuilder,
  NumericMutationJsonInput,
  NumericMutationOperand,
  NumericMutationOperandInput,
  RepositoryContext,
  NumericMutationOperation,
  RepositoryMutationScalarValue,
} from './types.js';

export type NumericMutationNode = Readonly<{
  kind: 'numericMutation';
  operation: NumericMutationOperation;
  value: NumericMutationOperand;
}>;

const operations: readonly NumericMutationOperation[] = [
  'increment',
  'decrement',
  'multiply',
  'divide',
];
const numericTypes: ReadonlySet<string> = new Set([
  'integer',
  'bigInt',
  'decimal',
  'float',
  'double',
]);

// Only normalized operations are executable; similarly shaped JSON remains data.
const normalizedOperations: WeakSet<object> = new WeakSet();

class DefaultNumericMutationBuilder implements NumericMutationBuilder {
  increment(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { increment: value };
  }
  decrement(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { decrement: value };
  }
  multiply(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { multiply: value };
  }
  divide(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return { divide: value };
  }
}

export function isNumericMutation(
  value: unknown,
): value is NumericMutationNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    normalizedOperations.has(value)
  );
}

export function normalizeNumericMutation(
  collection: CollectionDefinition,
  field: FieldDefinition,
  input: unknown,
  updating: boolean,
  context?: RepositoryContext,
  path: readonly (string | number)[] = ['values', field.name],
): RepositoryMutationScalarValue {
  if (isTemporalType(field.type))
    return normalizeTemporalValue(
      field,
      resolveMutationValue(input, context, path).value,
      'INVALID_MUTATION',
      path,
    );
  const fail = (message: string, variable?: string): never => {
    throw new RepositoryError('INVALID_MUTATION', message, {
      collection: collection.name,
      field: field.name,
      path,
      details: variable ? { variable } : undefined,
    });
  };
  // Objects in JSON fields are always data, including keys named "increment".
  if (field.type === 'json' && typeof input !== 'function')
    return input as RepositoryMutationScalarValue;
  if (
    typeof input !== 'function' &&
    (typeof input !== 'object' ||
      input === null ||
      input instanceof Date ||
      input instanceof Uint8Array)
  ) {
    return input as RepositoryMutationScalarValue;
  }
  if (
    typeof input !== 'function' &&
    !numericTypes.has(field.type) &&
    !operations.some((operation) => Object.hasOwn(input, operation))
  )
    return input as RepositoryMutationScalarValue;
  if (!updating || !numericTypes.has(field.type)) {
    return fail(
      'Atomic updates require a writable numeric Field in an update operation.',
    );
  }
  // Identity changes cannot be reconstructed safely from driver-specific numeric arithmetic.
  if (
    field.primaryKey ||
    field.unique ||
    collection.constraints?.some(
      (constraint) =>
        (constraint.type === 'primary' || constraint.type === 'unique') &&
        constraint.fields.includes(field.name),
    )
  ) {
    return fail(
      'Atomic updates cannot modify primary or unique identity Fields.',
    );
  }
  const value: unknown =
    typeof input === 'function'
      ? (input as (builder: NumericMutationBuilder) => unknown)(
          new DefaultNumericMutationBuilder(),
        )
      : input;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('Expected one numeric update operation.');
  const keys = Object.keys(value);
  if (
    keys.length !== 1 ||
    !operations.includes(keys[0] as NumericMutationOperation)
  )
    return fail('Expected exactly one numeric update operation.');
  const operation = keys[0] as NumericMutationOperation;
  const resolved = resolveMutationValue(
    (value as Record<string, unknown>)[operation],
    context,
    [...path, operation],
  );
  const variable = resolved.variable;
  const operand = resolved.value;
  if (!(
    (typeof operand === 'number' && Number.isFinite(operand)) ||
    typeof operand === 'bigint' ||
    (typeof operand === 'string' &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(operand) &&
      Number.isFinite(Number(operand)))
  )) {
    return fail(
      'Numeric update operands must be finite numbers, bigint values, or decimal strings.',
      variable,
    );
  }
  if (
    (field.type === 'integer' || field.type === 'bigInt') &&
    !(
      typeof operand === 'bigint' ||
      (typeof operand === 'number' && Number.isSafeInteger(operand)) ||
      (typeof operand === 'string' && /^[+-]?\d+$/.test(operand))
    )
  ) {
    return fail('Integer update operands must be exact integers.', variable);
  }
  if (operation === 'divide' && Number(operand) === 0)
    return fail('Numeric update division by zero is not allowed.', variable);
  const node: NumericMutationNode = {
    kind: 'numericMutation',
    operation,
    value: operand,
  };
  normalizedOperations.add(node);
  return node;
}
