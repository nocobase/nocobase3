import type {
  FieldDefinition,
  RelationFieldDefinition,
  FilterAst,
  FilterNode,
  FilterOperator,
  SortAst,
} from '@nocobase/db';
import type { DataCondition, DataSort } from './data-contracts.js';

type AnyFieldDefinition = FieldDefinition | RelationFieldDefinition;

export class DataAccessError extends Error {
  constructor(message: string = 'Data access denied or resource unavailable') {
    super(message);
    this.name = 'DataAccessError';
  }
}

export function dataFilter(
  conditions: readonly DataCondition[],
  fields: readonly AnyFieldDefinition[],
): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: conditions.map((condition) => compileCondition(condition, fields)),
    },
  };
}

function compileCondition(
  condition: DataCondition,
  fields: readonly AnyFieldDefinition[],
): FilterNode {
  const field = fields.find(
    (candidate) => candidate.name === condition.field && !candidate.target,
  );
  if (!field) throw new DataAccessError('Field is unavailable');
  if (condition.operator === 'in' || condition.operator === 'notIn') {
    if (
      !Array.isArray(condition.value) ||
      condition.value.length === 0 ||
      condition.value.length > 1000
    )
      throw new DataAccessError('Unsupported membership condition');
    return {
      kind: 'group',
      logic: condition.operator === 'in' ? 'or' : 'and',
      items: condition.value.map((value) =>
        compileCondition(
          {
            field: condition.field,
            operator: condition.operator === 'in' ? 'eq' : 'ne',
            value,
          },
          fields,
        ),
      ),
    };
  }
  if (Array.isArray(condition.value))
    throw new DataAccessError('Unsupported comparison operand');
  let operator: FilterOperator;
  let value = condition.value;
  if (
    field.type === 'boolean' &&
    (condition.operator === 'eq' || condition.operator === 'ne')
  ) {
    // Repository boolean predicates use explicit truth operators. NULL comparisons
    // are not rewritten as empty/notEmpty because that changes string semantics.
    if (typeof value !== 'boolean')
      throw new DataAccessError('Boolean comparisons require true or false');
    operator = (condition.operator === 'eq' ? value : !value)
      ? '$isTruly'
      : '$isFalsy';
    value = undefined;
  } else {
    const dateOperators: Partial<
      Record<DataCondition['operator'], FilterOperator>
    > = {
      gt: '$dateAfter',
      gte: '$dateNotBefore',
      lt: '$dateBefore',
      lte: '$dateNotAfter',
    };
    operator =
      (['date', 'datetime', 'datetimeTz'].includes(field.type)
        ? dateOperators[condition.operator]
        : undefined) ?? (`$${condition.operator}` as FilterOperator);
  }
  return {
    kind: 'condition',
    path: [condition.field],
    operator,
    ...(value === undefined ? {} : { value }),
  };
}

export function dataSort(sort: readonly DataSort[]): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: sort.map((item) => ({
      kind: 'field',
      path: [item.field],
      direction: item.direction,
    })),
  };
}
