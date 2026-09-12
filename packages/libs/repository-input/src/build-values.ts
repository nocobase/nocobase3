import { DefaultRelationFieldMutationBuilder } from './relation-mutation-builder.js';
import {
  DefaultNumericMutationBuilder,
  DefaultValuesBuilder,
} from './value-builders.js';
import {
  inputError,
  isRecord,
  snapshotJson,
  type JsonValueOf,
  type JsonValue,
} from './json.js';
import { buildFilter } from './build-query.js';
import type {
  CreateMutationValues,
  UpdateMutationValues,
  MutationValuesInput,
  NumericMutationOperandInput,
  NumericMutationJsonInput,
  RepositoryFilter,
  RepositoryRecord,
} from './types.js';

/** Preserve known field names while removing executable inputs from wire types. */
export type BuiltMutationValues<T> = T extends (
  ...args: never[]
) => infer TResult
  ? TResult extends NumericMutationJsonInput
    ? JsonValueOf<TResult>
    : Readonly<Record<string, JsonValue>>
  : unknown extends T
    ? JsonValue
    : T extends Date | bigint
      ? string
      : T extends readonly unknown[]
        ? { readonly [K in keyof T]: BuiltMutationValues<T[K]> }
        : T extends object
          ? string extends keyof T
            ? Readonly<Record<string, JsonValue>>
            : { readonly [K in keyof T]: BuiltMutationValues<T[K]> }
          : T;

// Without collection metadata, the method the callback calls chooses its operation.
// Database field capabilities are still checked by the server.
class FieldBuilder extends DefaultRelationFieldMutationBuilder {
  readonly expressions = new Set<object>();
  private readonly numeric = new DefaultNumericMutationBuilder();
  increment(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return this.track(this.numeric.increment(value));
  }
  decrement(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return this.track(this.numeric.decrement(value));
  }
  multiply(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return this.track(this.numeric.multiply(value));
  }
  divide(value: NumericMutationOperandInput): NumericMutationJsonInput {
    return this.track(this.numeric.divide(value));
  }
  private track(value: NumericMutationJsonInput): NumericMutationJsonInput {
    this.expressions.add(value);
    return value;
  }
}

export function buildCreateValues<T extends object = RepositoryRecord>(
  input: MutationValuesInput<CreateMutationValues<T>>,
): BuiltMutationValues<CreateMutationValues<T>> {
  return buildValues(input, false) as BuiltMutationValues<
    CreateMutationValues<T>
  >;
}
export function buildUpdateValues<T extends object = RepositoryRecord>(
  input: MutationValuesInput<UpdateMutationValues<T>>,
): BuiltMutationValues<UpdateMutationValues<T>> {
  return buildValues(input, true) as BuiltMutationValues<
    UpdateMutationValues<T>
  >;
}

function buildValues(input: unknown, updating: boolean): unknown {
  const ancestors = new Set<object>();
  const visit = <T>(
    value: object,
    path: readonly (string | number)[],
    transform: () => T,
  ): T => {
    if (ancestors.has(value)) inputError(path, 'Circular mutation input.');
    ancestors.add(value);
    try {
      return transform();
    } finally {
      ancestors.delete(value);
    }
  };
  const values = (
    value: unknown,
    update: boolean,
    path: readonly (string | number)[],
  ): Record<string, unknown> => {
    const evaluated: unknown =
      typeof value === 'function'
        ? (value as (builder: DefaultValuesBuilder) => unknown)(
            new DefaultValuesBuilder(),
          )
        : value;
    if (!isRecord(evaluated))
      inputError(path, 'Values callbacks must return a plain object.');
    return visit(evaluated, path, () =>
      Object.fromEntries(
        Object.entries(evaluated).map(([key, item]) => [
          key,
          field(item, update, [...path, key]),
        ]),
      ),
    );
  };
  const list = (
    value: unknown,
    transform: (item: unknown) => unknown,
  ): unknown =>
    Array.isArray(value) ? value.map(transform) : transform(value);
  const filtered = (
    value: unknown,
    path: readonly (string | number)[],
  ): Record<string, unknown> => {
    if (!isRecord(value))
      inputError(path, 'Expected a relation operation object.');
    return {
      ...value,
      ...(typeof value.filter === 'function'
        ? {
            filter: buildFilter(
              value.filter as RepositoryFilter<RepositoryRecord>,
            ),
          }
        : {}),
    };
  };
  const create = (
    value: unknown,
    path: readonly (string | number)[],
  ): unknown => {
    if (
      isRecord(value) &&
      ((value.kind === 'relationCreate' && value.version === 1) ||
        (Object.hasOwn(value, 'through') && Object.hasOwn(value, 'values')))
    ) {
      return {
        ...value,
        values: values(value.values, false, [...path, 'values']),
      };
    }
    return values(value, false, path);
  };
  const relation = (
    value: Record<string, unknown>,
    path: readonly (string | number)[],
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (key === 'create')
          return [key, list(item, (v) => create(v, [...path, key]))];
        if (key === 'update')
          return [
            key,
            list(item, (v) => {
              const op = filtered(v, [...path, key]);
              return {
                ...op,
                values: values(op.values, true, [...path, key, 'values']),
              };
            }),
          ];
        if (key === 'upsert')
          return [
            key,
            list(item, (v) => {
              const op = filtered(v, [...path, key]);
              return {
                ...op,
                create: values(op.create, false, [...path, key, 'create']),
                update: values(op.update, true, [...path, key, 'update']),
              };
            }),
          ];
        if (key === 'delete' && item !== true)
          return [key, list(item, (v) => filtered(v, [...path, key]))];
        return [key, item];
      }),
    );
  const field = (
    value: unknown,
    update: boolean,
    path: readonly (string | number)[],
  ): unknown => {
    if (typeof value === 'function')
      return visit(value, path, () => {
        const builder = new FieldBuilder();
        const result: unknown = (value as (builder: FieldBuilder) => unknown)(
          builder,
        );
        if (result === builder) {
          const state = builder.toState();
          if (builder.expressions.size)
            inputError(
              path,
              'Do not mix numeric and relation operations in one callback.',
            );
          if (
            !update &&
            (state.disconnect !== undefined ||
              state.set !== undefined ||
              state.update.length ||
              state.upsert.length ||
              state.delete.length)
          )
            inputError(
              path,
              'Create callbacks only support create/connect operations.',
            );
          return relation(
            {
              ...(state.create.length
                ? {
                    create: state.create.map((target) =>
                      target.clientKey !== undefined
                        ? {
                            kind: 'relationCreate',
                            version: 1,
                            values: target.values,
                            clientKey: target.clientKey,
                            through: target.through,
                          }
                        : target.through !== undefined
                          ? { values: target.values, through: target.through }
                          : target.values,
                    ),
                  }
                : {}),
              ...(state.connect.length ? { connect: state.connect } : {}),
              ...(state.disconnect !== undefined
                ? { disconnect: state.disconnect }
                : {}),
              ...(state.set !== undefined ? { set: state.set } : {}),
              ...(state.update.length ? { update: state.update } : {}),
              ...(state.upsert.length ? { upsert: state.upsert } : {}),
              ...(state.delete.length ? { delete: state.delete } : {}),
            },
            path,
          );
        }
        if (update && isRecord(result) && builder.expressions.has(result)) {
          const state = builder.toState();
          if (
            state.create.length ||
            state.connect.length ||
            state.disconnect !== undefined ||
            state.set !== undefined ||
            state.update.length ||
            state.upsert.length ||
            state.delete.length
          )
            inputError(
              path,
              'Do not mix numeric and relation operations in one callback.',
            );
          return result;
        }
        inputError(
          path,
          'Callbacks must return their relation builder or numeric update expression.',
        );
      });
    if (!isRecord(value)) return value;
    // Plain scalar/JSON values remain data. Only documented relation operation
    // positions may contain nested callbacks; literal payloads are never walked.
    if (value.kind === 'literal' || value.kind === 'variable') return value;
    const keys = Object.keys(value);
    if (
      hasCallback(value) &&
      keys.length &&
      keys.every((key) =>
        [
          'create',
          'connect',
          'disconnect',
          'set',
          'update',
          'upsert',
          'delete',
        ].includes(key),
      )
    ) {
      return visit(value, path, () => relation(value, path));
    }
    return value;
  };
  return snapshotJson(values(input, updating, ['values']));
}

function hasCallback(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || seen.has(value))
    return false;
  seen.add(value);
  return Object.values(value).some((item: unknown) => hasCallback(item, seen));
}
