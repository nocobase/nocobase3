import type {
  FieldDefinition,
  RelationFieldDefinition,
  FilterAst,
  FilterGroupNode,
  FilterNode,
  FilterOperator,
  SortAst,
} from '@nocobase/db';
import type { DatabaseFilter } from '@nocobase/app-plugin-authorization/server';
import type { DataCondition, DataScalar, DataSort } from './data-contracts.js';

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

/** Translate every trusted authorization condition. Unsupported conditions fail closed. */
export function dataPolicyFilter(
  filter: DatabaseFilter,
  fields: readonly AnyFieldDefinition[],
): FilterAst {
  let nodes = 0;
  function compile(value: DatabaseFilter, depth: number): FilterGroupNode {
    if (++nodes > 1000 || depth > 20)
      throw new DataAccessError('Authorization scope is too complex');
    const items: FilterNode[] = [];
    for (const [field, expression] of Object.entries(value)) {
      if (field === '$and' || field === '$or') {
        if (!Array.isArray(expression)) throw new DataAccessError();
        // Repository omits empty groups. Empty OR means false, never no filter.
        if (field === '$or' && expression.length === 0) {
          throw new DataAccessError(
            'Empty disjunction authorization scopes are not supported',
          );
        }
        const children = (expression as readonly DatabaseFilter[]).map((item) =>
          compile(item, depth + 1),
        );
        // An empty AND is true. In OR it makes the complete branch true; in
        // AND it can be omitted. Normalize before Repository drops empty nodes.
        if (
          field === '$or' &&
          children.some((child) => child.items.length === 0)
        )
          continue;
        const nonempty = children.filter((child) => child.items.length > 0);
        if (nonempty.length)
          items.push({
            kind: 'group',
            logic: field === '$and' ? 'and' : 'or',
            items: nonempty,
          });
      } else {
        if (
          Array.isArray(expression) ||
          !expression ||
          typeof expression !== 'object'
        )
          throw new DataAccessError();
        for (const [operator, operand] of Object.entries(expression)) {
          if (
            ![
              '$eq',
              '$ne',
              '$in',
              '$notIn',
              '$gt',
              '$gte',
              '$lt',
              '$lte',
            ].includes(operator)
          )
            throw new DataAccessError();
          if (++nodes > 1000)
            throw new DataAccessError('Authorization scope is too complex');
          // SQL IN/NOT IN with NULL uses three-valued logic, not an OR of IS NULL.
          // Reject that policy shape rather than broadening its record scope.
          if (
            (operator === '$in' || operator === '$notIn') &&
            Array.isArray(operand) &&
            operand.includes(null)
          )
            throw new DataAccessError(
              'NULL membership authorization scopes are not supported',
            );
          items.push(
            compileCondition(
              {
                field,
                operator: operator.slice(1) as DataCondition['operator'],
                value: operand as DataScalar | DataScalar[],
              },
              fields,
            ),
          );
        }
      }
    }
    return { kind: 'group', logic: 'and', items };
  }
  return { kind: 'filter', version: 1, root: compile(filter, 0) };
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
