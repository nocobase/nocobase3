import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError } from './errors.js';
import type {
  MutationLiteral,
  MutationVariable,
  RepositoryContext,
  RepositoryMutationScalarValue,
  ValuesBuilder,
} from './types.js';

export class DefaultValuesBuilder implements ValuesBuilder {
  variable(path: string): MutationVariable {
    return { kind: 'variable', path };
  }

  literal<T extends RepositoryMutationScalarValue>(
    value: T,
  ): MutationLiteral<T> {
    return { kind: 'literal', value };
  }
}

export function evaluateValues(input: unknown): unknown {
  return typeof input === 'function'
    ? (input as (builder: ValuesBuilder) => unknown)(new DefaultValuesBuilder())
    : input;
}

export interface ResolvedMutationValue {
  readonly value: unknown;
  readonly expression: boolean;
  readonly variable?: string;
}

export function resolveMutationValue(
  input: unknown,
  context: RepositoryContext | undefined,
  path: readonly (string | number)[],
): ResolvedMutationValue {
  if (
    !isRecord(input) ||
    (input.kind !== 'variable' && input.kind !== 'literal')
  ) {
    return { value: input, expression: false };
  }
  if (input.kind === 'literal') {
    if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'value')) {
      throw new RepositoryError(
        'INVALID_MUTATION',
        'Expected { kind: literal, value }.',
        { path },
      );
    }
    if (input.value === undefined) {
      throw new RepositoryError(
        'INVALID_MUTATION',
        'Literal values must not be undefined.',
        { path },
      );
    }
    return { value: input.value, expression: true };
  }
  const variable = input.path;
  if (
    Object.keys(input).length !== 2 ||
    typeof variable !== 'string' ||
    !/^\$[^.]+(?:\.[^.]+)*$/.test(variable)
  ) {
    throw new RepositoryError(
      'INVALID_CONTEXT',
      'Variable paths must start with $ and contain non-empty segments.',
      { path },
    );
  }
  let value: unknown = context;
  for (const key of variable.slice(1).split('.')) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !Object.hasOwn(value, key)
    ) {
      throw new RepositoryError(
        'VARIABLE_NOT_FOUND',
        `Filter or values variable "${variable}" could not be resolved.`,
        { path, details: { variable } },
      );
    }
    value = (value as Readonly<Record<string, unknown>>)[key];
  }
  if (value === undefined) {
    throw new RepositoryError(
      'VARIABLE_NOT_FOUND',
      `Variable "${variable}" resolved to undefined.`,
      { path, details: { variable } },
    );
  }
  return { value, expression: true, variable };
}

export function validateResolvedMutationValue(
  field: FieldDefinition,
  resolved: ResolvedMutationValue,
  collection: string | undefined,
  path: readonly (string | number)[],
): RepositoryMutationScalarValue {
  const value = resolved.value;
  const valid = (() => {
    if (value === null) return field.nullable !== false && !field.primaryKey;
    switch (field.type) {
      case 'string':
      case 'text':
      case 'uuid':
      case 'time':
        return typeof value === 'string';
      case 'integer':
      case 'increments':
        return typeof value === 'number' && Number.isSafeInteger(value);
      case 'bigInt':
        return (
          typeof value === 'bigint' ||
          (typeof value === 'number' && Number.isSafeInteger(value)) ||
          (typeof value === 'string' && /^[+-]?\d+$/.test(value))
        );
      case 'decimal':
        return (
          (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' &&
            /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
        );
      case 'float':
      case 'double':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
      case 'datetime':
        return (
          (value instanceof Date && Number.isFinite(value.getTime())) ||
          (typeof value === 'string' && Number.isFinite(Date.parse(value)))
        );
      case 'json':
        return isJsonValue(value, new Set());
      case 'blob':
        return value instanceof Uint8Array;
      default:
        return (
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          value instanceof Date ||
          value instanceof Uint8Array ||
          isJsonValue(value, new Set())
        );
    }
  })();
  if (!valid) {
    throw new RepositoryError(
      'INVALID_MUTATION',
      `Resolved value is invalid for Field "${field.name}".`,
      {
        collection,
        field: field.name,
        path,
        details: resolved.variable
          ? { variable: resolved.variable }
          : undefined,
      },
    );
  }
  return value as RepositoryMutationScalarValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    isJsonValue(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
}
