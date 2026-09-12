export type DatabaseFilterScalar = string | number | boolean | null;

export type DatabaseFilterValue =
  DatabaseFilterScalar | readonly DatabaseFilterScalar[];

export type DatabaseFilterOperator =
  '$eq' | '$ne' | '$in' | '$notIn' | '$gt' | '$gte' | '$lt' | '$lte';

export type DatabaseFieldFilter = Readonly<
  Partial<Record<DatabaseFilterOperator, DatabaseFilterValue>>
>;

export type DatabaseFilter = Readonly<
  Record<string, DatabaseFieldFilter | readonly DatabaseFilter[]>
>;

const operators = new Set<DatabaseFilterOperator>([
  '$eq',
  '$ne',
  '$in',
  '$notIn',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
]);

export function allRecordsFilter(): DatabaseFilter {
  return { $and: [] };
}

export function noRecordsFilter(): DatabaseFilter {
  return { $or: [] };
}

export function andFilters(filters: readonly DatabaseFilter[]): DatabaseFilter {
  if (filters.some(isNoRecordsFilter)) return noRecordsFilter();
  const effective = filters.filter((filter) => !isAllRecordsFilter(filter));
  if (effective.length === 0) return allRecordsFilter();
  if (effective.length === 1) return effective[0];
  return { $and: effective };
}

export function orFilters(filters: readonly DatabaseFilter[]): DatabaseFilter {
  if (filters.some(isAllRecordsFilter)) return allRecordsFilter();
  const effective = filters.filter((filter) => !isNoRecordsFilter(filter));
  if (effective.length === 0) return noRecordsFilter();
  if (effective.length === 1) return effective[0];
  return { $or: effective };
}

export function isAllRecordsFilter(filter: DatabaseFilter): boolean {
  return isEmptyLogicalFilter(filter, '$and');
}

export function isNoRecordsFilter(filter: DatabaseFilter): boolean {
  return isEmptyLogicalFilter(filter, '$or');
}

export function assertDatabaseFilter(
  filter: unknown,
  fields: readonly string[],
): asserts filter is DatabaseFilter {
  if (!isPlainObject(filter)) throw new Error('Invalid Database Filter AST');
  const entries = Object.entries(filter);
  if (
    entries.length !== 1 ||
    (entries[0][0] !== '$and' && entries[0][0] !== '$or') ||
    !Array.isArray(entries[0][1])
  ) {
    throw new Error('Database Filter AST must use $and or $or as its root');
  }
  assertFilterObject(filter, new Set(fields));
}

function assertFilterObject(value: unknown, fields: ReadonlySet<string>): void {
  if (!isPlainObject(value)) throw new Error('Invalid Database Filter AST');
  for (const [field, expression] of Object.entries(value)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(expression)) {
        throw new Error(`${field} must be an array`);
      }
      for (const item of expression) assertFilterObject(item, fields);
      continue;
    }
    if (field.startsWith('$')) {
      throw new Error(`Unsupported Database Filter operator: ${field}`);
    }
    if (!fields.has(field)) {
      throw new Error(`Unknown Database Filter field: ${field}`);
    }
    assertFieldFilter(expression);
  }
}

function assertFieldFilter(value: unknown): void {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    throw new Error('A Database Filter field must contain an operator');
  }
  for (const [operator, operand] of Object.entries(value)) {
    if (!operators.has(operator as DatabaseFilterOperator)) {
      throw new Error(`Unsupported Database Filter operator: ${operator}`);
    }
    if (
      (operator === '$in' || operator === '$notIn') &&
      !Array.isArray(operand)
    ) {
      throw new Error(`${operator} requires an array value`);
    }
    assertFilterValue(operand);
  }
}

function assertFilterValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertFilterValue(item);
    return;
  }
  if (
    value !== null &&
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error('Invalid Database Filter value');
  }
}

function isEmptyLogicalFilter(
  filter: DatabaseFilter,
  operator: '$and' | '$or',
): boolean {
  const entries = Object.entries(filter);
  return (
    entries.length === 1 &&
    entries[0][0] === operator &&
    Array.isArray(entries[0][1]) &&
    entries[0][1].length === 0
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
