import type {
  FilterAst,
  FilterGroupNode,
  FilterLiteral,
  FilterNode,
  FilterOperator,
} from '@nocobase/db';

/**
 * A scope before it is attached to a Collection: `true` is every row, `false`
 * is none, and a node is a condition on this Collection's own columns.
 *
 * The two constants exist because an empty `or` and an empty `and` are not
 * expressible as groups — `{ logic: 'or', items: [] }` reads as a filter that
 * matches everything in most engines — so emptiness is carried out of band and
 * decided at the node level: `false` denies the action, `true` binds no filter.
 */
export type DatabaseScope = boolean | FilterNode;

/**
 * Conditions are built literally rather than through `FilterBuilder`, which
 * picks `string()` or `number()` from a field's type. The Collection registry
 * records field names only.
 */
export function condition(
  field: string,
  operator: FilterOperator,
  value?: FilterLiteral,
): FilterNode {
  return {
    kind: 'condition',
    path: [field],
    operator,
    ...(value === undefined ? {} : { value }),
  };
}

export function anyScope(scopes: readonly DatabaseScope[]): DatabaseScope {
  if (scopes.includes(true)) return true;
  const items = scopes.filter((scope): scope is FilterNode => scope !== false);
  if (items.length === 0) return false;
  return items.length === 1 ? items[0] : group('or', items);
}

export function allScopes(scopes: readonly DatabaseScope[]): DatabaseScope {
  if (scopes.includes(false)) return false;
  const items = scopes.filter((scope): scope is FilterNode => scope !== true);
  if (items.length === 0) return true;
  return items.length === 1 ? items[0] : group('and', items);
}

/**
 * Membership expands to one `$eq` per identifier because `FilterOperator` has
 * no `$in` — `$includes` is a substring test. A negated list would expand the
 * same way, as an `and` of `$ne`. Both collapse once db grows the operator.
 */
export function idsScope(field: string, ids: readonly string[]): DatabaseScope {
  return anyScope(ids.map((id) => condition(field, '$eq', id)));
}

/** Attach a scope to its Collection. `true` and `false` are decided by the caller. */
export function scopeAst(collection: string, scope: FilterNode): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    collection,
    root: scope.kind === 'group' ? scope : group('and', [scope]),
  };
}

function group(
  logic: 'and' | 'or',
  items: readonly FilterNode[],
): FilterGroupNode {
  return { kind: 'group', logic, items };
}

const operators: ReadonlySet<string> = new Set<FilterOperator>([
  '$includes',
  '$notIncludes',
  '$startsWith',
  '$endsWith',
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$empty',
  '$notEmpty',
  '$dateOn',
  '$dateNotOn',
  '$dateBefore',
  '$dateAfter',
  '$dateNotBefore',
  '$dateNotAfter',
  '$dateBetween',
  '$isTruly',
  '$isFalsy',
]);

/**
 * A Record Access policy may be configured rather than written, so what it
 * returns is checked against the same rule db applies to a Policy scope: this
 * Collection's own registered columns, no relation traversal, no JSON
 * operator. The check runs here so a bad rule is a denial with a reason, not a
 * Repository error at query time.
 */
export function assertDatabaseScope(
  value: unknown,
  fields: readonly string[],
): asserts value is DatabaseScope {
  if (typeof value === 'boolean') return;
  assertScopeNode(value, new Set(fields));
}

function assertScopeNode(value: unknown, fields: ReadonlySet<string>): void {
  if (!isRecord(value)) throw new Error('Invalid Record Access scope');
  if (value.kind === 'group') {
    if (value.logic !== 'and' && value.logic !== 'or') {
      throw new Error('A Record Access scope group must be $and or $or');
    }
    if (!Array.isArray(value.items)) {
      throw new Error('A Record Access scope group must have items');
    }
    for (const item of value.items) assertScopeNode(item, fields);
    return;
  }
  if (value.kind !== 'condition') {
    throw new Error('A Record Access scope must not traverse relations');
  }
  const path: unknown = value.path;
  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error('A Record Access scope must name a direct field');
  }
  const field: unknown = path[0];
  if (typeof field !== 'string' || !fields.has(field)) {
    throw new Error(`Unknown Record Access scope field: ${String(field)}`);
  }
  if (typeof value.operator !== 'string' || !operators.has(value.operator)) {
    throw new Error(
      `Unsupported Record Access scope operator: ${String(value.operator)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
