import type {
  BooleanFilterOperators,
  DateFilterOperators,
  EmptyFilterOperators,
  FilterBuilder,
  FilterConditionNode,
  FilterFieldGroup,
  FilterGroupNode,
  FilterNode,
  FilterOperand,
  FilterOperator,
  FilterRelationNode,
  FilterVariable,
  JsonFilterOperators,
  NumberFilterOperators,
  RelationFilterOperators,
  RepositoryPath,
  RepositoryRecord,
  StringFilterOperators,
  StringFilterOptions,
  TextFilterOperators,
  TimeFilterOperators,
} from './types.js';

export class DefaultFilterBuilder<
  TRecord extends object = RepositoryRecord,
> implements FilterBuilder<TRecord> {
  and(items: readonly FilterNode[]): FilterGroupNode {
    return { kind: 'group', logic: 'and', items };
  }

  or(items: readonly FilterNode[]): FilterGroupNode {
    return { kind: 'group', logic: 'or', items };
  }

  variable(path: string): FilterVariable {
    return { kind: 'variable', path };
  }

  string(path: string | RepositoryPath): StringFilterOperators {
    return new StringOperators(normalizePath(path), 'string');
  }

  text(path: string | RepositoryPath): TextFilterOperators {
    return new StringOperators(normalizePath(path), 'text');
  }

  number(path: string | RepositoryPath): NumberFilterOperators {
    return new NumberOperators(normalizePath(path), 'number');
  }

  date(path: string | RepositoryPath): DateFilterOperators {
    return new DateOperators(normalizePath(path), 'date');
  }

  time(path: string | RepositoryPath): TimeFilterOperators {
    return new TimeOperators(normalizePath(path), 'time');
  }

  boolean(path: string | RepositoryPath): BooleanFilterOperators {
    return new BooleanOperators(normalizePath(path), 'boolean');
  }

  json(_path: string | RepositoryPath): JsonFilterOperators {
    return {};
  }

  relation<TTarget extends object = RepositoryRecord>(
    path: string | RepositoryPath,
  ): RelationFilterOperators<TTarget> {
    return new RelationOperators<TTarget>(normalizePath(path));
  }
}

class BaseOperators implements EmptyFilterOperators {
  constructor(
    protected readonly path: RepositoryPath,
    protected readonly group: FilterFieldGroup,
  ) {}

  empty(): FilterConditionNode {
    return condition(this.path, this.group, '$empty');
  }

  notEmpty(): FilterConditionNode {
    return condition(this.path, this.group, '$notEmpty');
  }
}

class StringOperators extends BaseOperators implements StringFilterOperators {
  includes(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$includes', value, options);
  }

  notIncludes(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$notIncludes', value, options);
  }

  eq(
    value: FilterOperand<string | null>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$eq', value, options);
  }

  ne(
    value: FilterOperand<string | null>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$ne', value, options);
  }

  startsWith(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$startsWith', value, options);
  }

  endsWith(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    return this.build('$endsWith', value, options);
  }

  private build(
    operator: FilterOperator,
    value: FilterOperand<string | null>,
    options?: StringFilterOptions,
  ): FilterConditionNode {
    const node = condition(this.path, this.group, operator, value);
    if (options?.mode !== undefined)
      Object.assign(node, { mode: options.mode });
    return node;
  }
}

class NumberOperators extends BaseOperators implements NumberFilterOperators {
  eq(value: FilterOperand<number | null>): FilterConditionNode {
    return condition(this.path, this.group, '$eq', value);
  }

  ne(value: FilterOperand<number | null>): FilterConditionNode {
    return condition(this.path, this.group, '$ne', value);
  }

  gt(value: FilterOperand<number>): FilterConditionNode {
    return condition(this.path, this.group, '$gt', value);
  }

  gte(value: FilterOperand<number>): FilterConditionNode {
    return condition(this.path, this.group, '$gte', value);
  }

  lt(value: FilterOperand<number>): FilterConditionNode {
    return condition(this.path, this.group, '$lt', value);
  }

  lte(value: FilterOperand<number>): FilterConditionNode {
    return condition(this.path, this.group, '$lte', value);
  }
}

class DateOperators extends BaseOperators implements DateFilterOperators {
  on(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateOn', value);
  }

  notOn(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateNotOn', value);
  }

  before(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateBefore', value);
  }

  after(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateAfter', value);
  }

  notBefore(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateNotBefore', value);
  }

  notAfter(value: FilterOperand<string | Date>): FilterConditionNode {
    return dateCondition(this.path, this.group, '$dateNotAfter', value);
  }

  between(
    value: readonly [
      FilterOperand<string | Date>,
      FilterOperand<string | Date>,
    ],
  ): FilterConditionNode {
    return condition(
      this.path,
      this.group,
      '$dateBetween',
      value.map(normalizeDateOperand),
    );
  }
}

class TimeOperators extends BaseOperators implements TimeFilterOperators {
  eq(value: FilterOperand<string | null>): FilterConditionNode {
    return condition(this.path, this.group, '$eq', value);
  }

  ne(value: FilterOperand<string | null>): FilterConditionNode {
    return condition(this.path, this.group, '$ne', value);
  }
}

class BooleanOperators extends BaseOperators implements BooleanFilterOperators {
  isTrue(): FilterConditionNode {
    return condition(this.path, this.group, '$isTruly');
  }

  isFalse(): FilterConditionNode {
    return condition(this.path, this.group, '$isFalsy');
  }
}

class RelationOperators<
  TTarget extends object,
> implements RelationFilterOperators<TTarget> {
  constructor(private readonly path: RepositoryPath) {}

  some(
    callback: (filter: FilterBuilder<TTarget>) => FilterNode,
  ): FilterRelationNode {
    return relationCondition(this.path, 'some', callback);
  }

  none(
    callback: (filter: FilterBuilder<TTarget>) => FilterNode,
  ): FilterRelationNode {
    return relationCondition(this.path, 'none', callback);
  }

  exists(): FilterRelationNode {
    return { kind: 'relation', path: this.path, quantifier: 'exists' };
  }

  notExists(): FilterRelationNode {
    return { kind: 'relation', path: this.path, quantifier: 'notExists' };
  }

  empty(): FilterRelationNode {
    return { kind: 'relation', path: this.path, quantifier: 'empty' };
  }

  notEmpty(): FilterRelationNode {
    return { kind: 'relation', path: this.path, quantifier: 'notEmpty' };
  }
}

function condition(
  path: RepositoryPath,
  group: FilterFieldGroup,
  operator: FilterOperator,
  value?: FilterConditionNode['value'],
): FilterConditionNode {
  const node: FilterConditionNode =
    value === undefined
      ? { kind: 'condition', path, operator }
      : { kind: 'condition', path, operator, value };
  Object.defineProperty(node, FILTER_FIELD_GROUP, { value: group });
  return node;
}

function dateCondition(
  path: RepositoryPath,
  group: FilterFieldGroup,
  operator: FilterOperator,
  value: FilterOperand<string | Date>,
): FilterConditionNode {
  return condition(path, group, operator, normalizeDateOperand(value));
}

function normalizeDateOperand(
  value: FilterOperand<string | Date>,
): string | FilterVariable {
  return value instanceof Date ? value.toISOString() : value;
}

function relationCondition<TTarget extends object>(
  path: RepositoryPath,
  quantifier: 'some' | 'none',
  callback: (filter: FilterBuilder<TTarget>) => FilterNode,
): FilterRelationNode {
  const node = callback(new DefaultFilterBuilder<TTarget>());
  const filter: FilterGroupNode =
    node.kind === 'group'
      ? node
      : { kind: 'group', logic: 'and', items: [node] };
  return { kind: 'relation', path, quantifier, filter };
}

function normalizePath(path: string | RepositoryPath): RepositoryPath {
  return typeof path === 'string' ? path.split('.') : [...path];
}

const FILTER_FIELD_GROUP: unique symbol = Symbol('repositoryFilterFieldGroup');

export function getFilterFieldGroup(
  node: FilterConditionNode,
): FilterFieldGroup | undefined {
  return (
    node as FilterConditionNode & {
      [FILTER_FIELD_GROUP]?: FilterFieldGroup;
    }
  )[FILTER_FIELD_GROUP];
}
