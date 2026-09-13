import {
  buildFilter,
  type FilterAst,
  type RepositoryFilter,
} from '@nocobase/repository-input';
import { RepositoryError } from '../errors.js';
import type {
  NormalizedCreateNode,
  NormalizedDeleteNode,
  NormalizedReadNode,
  NormalizedRelationShapeNode,
  NormalizedRelationWriteNode,
  NormalizedRepositoryPolicy,
  NormalizedThroughNode,
  NormalizedWriteNode,
  PolicyRef,
  PolicyScalarValue,
  RepositoryPolicy,
} from './types.js';

type PolicyPath = readonly (string | number)[];

function invalid(message: string, path: PolicyPath): never {
  throw new RepositoryError('INVALID_POLICY', message, { path });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function assertObject(
  value: unknown,
  path: PolicyPath,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) invalid('Expected a plain Policy object.', path);
}

function assertKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: PolicyPath,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      invalid(`Unsupported Policy option: ${key}.`, [...path, key]);
    }
  }
}

function assertName(value: unknown, path: PolicyPath): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('.') ||
    value.includes('*')
  ) {
    invalid('Expected a direct field or relation name.', path);
  }
}

function normalizeFields(value: unknown, path: PolicyPath): readonly string[] {
  if (value === undefined || value === false) return [];
  if (!Array.isArray(value)) {
    invalid('fields must be false or an array of direct field names.', path);
  }
  const fields: string[] = [];
  for (const [index, field] of value.entries()) {
    assertName(field, [...path, index]);
    if (fields.includes(field)) {
      invalid('fields must not contain duplicates.', [...path, index]);
    }
    fields.push(field);
  }
  return Object.freeze(fields);
}

function normalizeScope(value: unknown, path: PolicyPath): true | FilterAst {
  if (value === true) return true;
  if (value === undefined) invalid('scope is required.', path);
  try {
    return Object.freeze(
      buildFilter(value as RepositoryFilter<Record<string, unknown>>),
    );
  } catch (error) {
    if (error instanceof RepositoryError) {
      invalid(error.message, path);
    }
    throw error;
  }
}

function normalizeDefaults(
  value: unknown,
  path: PolicyPath,
): Readonly<Record<string, PolicyScalarValue>> {
  if (value === undefined) return Object.freeze({});
  assertObject(value, path);
  const defaults: Record<string, PolicyScalarValue> = {};
  for (const [field, item] of Object.entries(value)) {
    assertName(field, [...path, field]);
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      item instanceof Date
    ) {
      defaults[field] = item;
      continue;
    } else {
      invalid('defaults values must be scalar values.', [...path, field]);
    }
  }
  return Object.freeze(defaults);
}

function normalizeRef(value: unknown, path: PolicyPath): PolicyRef {
  assertObject(value, path);
  assertKeys(value, ['kind', 'target'], path);
  if (value.kind !== 'policyRef' || typeof value.target !== 'string') {
    invalid('Expected a valid Policy reference.', path);
  }
  return Object.freeze({
    kind: 'policyRef',
    target: value.target,
  });
}

function normalizeReadNode(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
): NormalizedReadNode {
  assertObject(value, path);
  if (ancestors.has(value)) invalid('Policy must not contain cycles.', path);
  ancestors.add(value);
  try {
    assertKeys(value, ['scope', 'fields', 'relations'], path);
    const relations: Record<string, NormalizedReadNode | PolicyRef> = {};
    if (value.relations !== undefined && value.relations !== false) {
      assertObject(value.relations, [...path, 'relations']);
      for (const [name, child] of Object.entries(value.relations)) {
        assertName(name, [...path, 'relations', name]);
        const childPath = [...path, 'relations', name];
        if (isObject(child) && child.kind === 'policyRef') {
          relations[name] = normalizeRef(child, childPath);
        } else {
          relations[name] = normalizeReadNode(child, childPath, ancestors);
        }
      }
    }
    return Object.freeze({
      scope: normalizeScope(value.scope, [...path, 'scope']),
      fields: normalizeFields(value.fields, [...path, 'fields']),
      relations: Object.freeze(relations),
    });
  } finally {
    ancestors.delete(value);
  }
}

function normalizeThrough(
  value: unknown,
  path: PolicyPath,
): NormalizedThroughNode {
  if (value === undefined || value === false) {
    return Object.freeze({ through: false });
  }
  assertObject(value, path);
  assertKeys(value, ['through'], path);
  return Object.freeze({
    through:
      value.through === undefined || value.through === false
        ? false
        : Object.freeze({
            fields: normalizeFields(
              isObject(value.through) ? value.through.fields : undefined,
              [...path, 'through', 'fields'],
            ),
          }),
  });
}

function normalizeRelationShape(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
  allowThrough: boolean,
): NormalizedRelationShapeNode {
  assertObject(value, path);
  if (ancestors.has(value)) invalid('Policy must not contain cycles.', path);
  ancestors.add(value);
  try {
    assertKeys(
      value,
      allowThrough
        ? ['fields', 'relations', 'through']
        : ['fields', 'relations'],
      path,
    );
    const relations: Record<string, NormalizedRelationWriteNode> = {};
    if (value.relations !== undefined && value.relations !== false) {
      assertObject(value.relations, [...path, 'relations']);
      for (const [name, child] of Object.entries(value.relations)) {
        assertName(name, [...path, 'relations', name]);
        relations[name] = normalizeRelationWrite(
          child,
          [...path, 'relations', name],
          ancestors,
        );
      }
    }
    return Object.freeze({
      fields: normalizeFields(value.fields, [...path, 'fields']),
      relations: Object.freeze(relations),
      ...(allowThrough
        ? {
            through: normalizeThrough({ through: value.through }, path).through,
          }
        : {}),
    });
  } finally {
    ancestors.delete(value);
  }
}

function normalizeRelationWrite(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
): NormalizedRelationWriteNode {
  assertObject(value, path);
  assertKeys(
    value,
    [
      'scope',
      'create',
      'update',
      'upsert',
      'connect',
      'disconnect',
      'set',
      'delete',
    ],
    path,
  );
  const result: {
    scope?: true | FilterAst;
    create?: NormalizedRelationShapeNode;
    update?: NormalizedRelationShapeNode;
    upsert?: {
      create: NormalizedRelationShapeNode;
      update: NormalizedRelationShapeNode;
    };
    connect?: NormalizedThroughNode;
    disconnect?: Readonly<Record<string, never>>;
    set?: NormalizedThroughNode;
    delete?: Readonly<Record<string, never>>;
  } = {};
  if (value.scope !== undefined) {
    result.scope = normalizeScope(value.scope, [...path, 'scope']);
  }
  if (value.create !== undefined) {
    result.create = normalizeRelationShape(
      value.create,
      [...path, 'create'],
      ancestors,
      true,
    );
  }
  if (value.update !== undefined) {
    result.update = normalizeRelationShape(
      value.update,
      [...path, 'update'],
      ancestors,
      false,
    );
  }
  if (value.upsert !== undefined) {
    assertObject(value.upsert, [...path, 'upsert']);
    assertKeys(value.upsert, ['create', 'update'], [...path, 'upsert']);
    result.upsert = Object.freeze({
      create: normalizeRelationShape(
        value.upsert.create,
        [...path, 'upsert', 'create'],
        ancestors,
        false,
      ),
      update: normalizeRelationShape(
        value.upsert.update,
        [...path, 'upsert', 'update'],
        ancestors,
        false,
      ),
    });
  }
  for (const operation of ['connect', 'set'] as const) {
    if (value[operation] !== undefined) {
      result[operation] = normalizeThrough(value[operation], [
        ...path,
        operation,
      ]);
    }
  }
  for (const operation of ['disconnect', 'delete'] as const) {
    if (value[operation] !== undefined) {
      assertObject(value[operation], [...path, operation]);
      assertKeys(value[operation], [], [...path, operation]);
      result[operation] = Object.freeze({});
    }
  }
  return Object.freeze(result);
}

function normalizeWriteNode(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
  allowDefaults = false,
): NormalizedWriteNode {
  assertObject(value, path);
  assertKeys(
    value,
    allowDefaults
      ? ['scope', 'fields', 'relations', 'defaults']
      : ['scope', 'fields', 'relations'],
    path,
  );
  const relations: Record<string, NormalizedRelationWriteNode> = {};
  if (value.relations !== undefined && value.relations !== false) {
    assertObject(value.relations, [...path, 'relations']);
    for (const [name, child] of Object.entries(value.relations)) {
      assertName(name, [...path, 'relations', name]);
      relations[name] = normalizeRelationWrite(
        child,
        [...path, 'relations', name],
        ancestors,
      );
    }
  }
  return Object.freeze({
    scope: normalizeScope(value.scope, [...path, 'scope']),
    fields: normalizeFields(value.fields, [...path, 'fields']),
    relations: Object.freeze(relations),
  });
}

function normalizeCreateNode(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
): NormalizedCreateNode {
  assertObject(value, path);
  assertKeys(value, ['scope', 'fields', 'relations', 'defaults'], path);
  return Object.freeze({
    ...normalizeWriteNode(value, path, ancestors, true),
    defaults: normalizeDefaults(value.defaults, [...path, 'defaults']),
  });
}

function normalizeDeleteNode(
  value: unknown,
  path: PolicyPath,
): NormalizedDeleteNode {
  assertObject(value, path);
  assertKeys(value, ['scope'], path);
  return Object.freeze({
    scope: normalizeScope(value.scope, [...path, 'scope']),
  });
}

export function normalizeRepositoryPolicy<
  TRecord extends object = Record<string, unknown>,
>(input: RepositoryPolicy<TRecord>): NormalizedRepositoryPolicy {
  assertObject(input, []);
  assertKeys(input, ['read', 'create', 'update', 'delete'], []);
  for (const key of ['read', 'create', 'update', 'delete'] as const) {
    if (!(key in input)) invalid(`${key} is required.`, [key]);
  }
  const ancestors = new Set<object>();
  const normalizeNode = <T>(
    value: unknown,
    path: PolicyPath,
    normalize: (value: unknown, path: PolicyPath, ancestors: Set<object>) => T,
  ): true | false | T => {
    if (value === true || value === false) return value;
    return normalize(value, path, ancestors);
  };
  return Object.freeze({
    read: normalizeNode(input.read, ['read'], normalizeReadNode),
    create: normalizeNode(input.create, ['create'], normalizeCreateNode),
    update: normalizeNode(input.update, ['update'], normalizeWriteNode),
    delete:
      input.delete === true || input.delete === false
        ? input.delete
        : normalizeDeleteNode(input.delete, ['delete']),
  });
}
