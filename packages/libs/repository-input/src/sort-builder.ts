import type {
  RepositoryPath,
  RepositoryRecord,
  SortAggregateBuilder,
  SortAggregateNode,
  SortBuilder,
  SortDirection,
  SortExpression,
  SortFieldBuilder,
  SortNode,
  SortNullsBuilder,
  SortNullsPosition,
  SortRelationBuilder,
} from './types.js';

export class DefaultSortBuilder<
  TRecord extends object = RepositoryRecord,
> implements SortBuilder<TRecord> {
  field(path: string | RepositoryPath): SortFieldBuilder {
    return new DefaultSortFieldBuilder(normalizePath(path));
  }

  relation(path: string | RepositoryPath): SortRelationBuilder {
    return new DefaultSortRelationBuilder(normalizePath(path));
  }
}

class DefaultSortFieldBuilder implements SortFieldBuilder {
  constructor(private readonly path: RepositoryPath) {}

  asc(): SortNullsBuilder {
    return new DefaultSortExpression({
      kind: 'field',
      path: this.path,
      direction: 'asc',
    });
  }

  desc(): SortNullsBuilder {
    return new DefaultSortExpression({
      kind: 'field',
      path: this.path,
      direction: 'desc',
    });
  }
}

class DefaultSortRelationBuilder implements SortRelationBuilder {
  constructor(private readonly relation: RepositoryPath) {}

  count(): SortAggregateBuilder {
    return new DefaultSortAggregateBuilder(this.relation, 'count');
  }

  sum(field: string): SortAggregateBuilder {
    return new DefaultSortAggregateBuilder(this.relation, 'sum', field);
  }

  avg(field: string): SortAggregateBuilder {
    return new DefaultSortAggregateBuilder(this.relation, 'avg', field);
  }

  min(field: string): SortAggregateBuilder {
    return new DefaultSortAggregateBuilder(this.relation, 'min', field);
  }

  max(field: string): SortAggregateBuilder {
    return new DefaultSortAggregateBuilder(this.relation, 'max', field);
  }
}

class DefaultSortAggregateBuilder implements SortAggregateBuilder {
  constructor(
    private readonly relation: RepositoryPath,
    private readonly aggregate: SortAggregateNode['aggregate'],
    private readonly field?: string,
  ) {}

  asc(): SortNullsBuilder {
    return new DefaultSortExpression(this.node('asc'));
  }

  desc(): SortNullsBuilder {
    return new DefaultSortExpression(this.node('desc'));
  }

  private node(direction: SortDirection): SortAggregateNode {
    return this.aggregate === 'count'
      ? {
          kind: 'aggregate',
          relation: this.relation,
          aggregate: 'count',
          direction,
        }
      : {
          kind: 'aggregate',
          relation: this.relation,
          aggregate: this.aggregate,
          field: requiredAggregateField(this.field),
          direction,
        };
  }
}

class DefaultSortExpression implements SortNullsBuilder {
  readonly kind = 'sortExpression' as const;

  constructor(private readonly node: SortNode) {}

  nullsFirst(): SortExpression {
    return new DefaultSortExpression(withNulls(this.node, 'first'));
  }

  nullsLast(): SortExpression {
    return new DefaultSortExpression(withNulls(this.node, 'last'));
  }

  toNode(): SortNode {
    return this.node;
  }
}

export function sortExpressionToNode(expression: SortExpression): SortNode {
  if (!(expression instanceof DefaultSortExpression)) {
    throw new TypeError('Sort callbacks must return Sort Builder expressions.');
  }
  return expression.toNode();
}

function withNulls(node: SortNode, nulls: SortNullsPosition): SortNode {
  return { ...node, nulls };
}

function normalizePath(path: string | RepositoryPath): RepositoryPath {
  return typeof path === 'string' ? path.split('.') : [...path];
}

function requiredAggregateField(field: string | undefined): string {
  if (field === undefined) {
    throw new TypeError('Value aggregate sorts require a Field.');
  }
  return field;
}
