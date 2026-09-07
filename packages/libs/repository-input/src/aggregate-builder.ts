import type {
  AggregateBuilder,
  AggregateExpression,
  AggregateFunction,
  AggregateNode,
  RepositoryAggregateNumeric,
  RepositoryRecord,
} from './types.js';

export class DefaultAggregateBuilder<
  TRecord extends object = RepositoryRecord,
> implements AggregateBuilder<TRecord> {
  count(field?: keyof TRecord & string): AggregateExpression<number> {
    return new DefaultAggregateExpression('count', field);
  }

  sum(
    field: keyof TRecord & string,
  ): AggregateExpression<RepositoryAggregateNumeric | null> {
    return new DefaultAggregateExpression('sum', field);
  }

  avg(
    field: keyof TRecord & string,
  ): AggregateExpression<RepositoryAggregateNumeric | null> {
    return new DefaultAggregateExpression('avg', field);
  }

  min<TKey extends keyof TRecord & string>(
    field: TKey,
  ): AggregateExpression<TRecord[TKey] | null> {
    return new DefaultAggregateExpression('min', field);
  }

  max<TKey extends keyof TRecord & string>(
    field: TKey,
  ): AggregateExpression<TRecord[TKey] | null> {
    return new DefaultAggregateExpression('max', field);
  }
}

class DefaultAggregateExpression<T> implements AggregateExpression<T> {
  readonly kind = 'aggregateExpression' as const;

  constructor(
    private readonly aggregate: AggregateFunction,
    private readonly field?: string,
  ) {}

  toNode(alias: string): AggregateNode {
    return this.aggregate === 'count'
      ? { kind: 'count', alias, field: this.field }
      : {
          kind: this.aggregate,
          alias,
          field: requiredAggregateField(this.field),
        };
  }
}

function requiredAggregateField(field: string | undefined): string {
  if (field === undefined) {
    throw new TypeError('Value aggregates require a Field.');
  }
  return field;
}

export function aggregateExpressionToNode(
  alias: string,
  expression: AggregateExpression<unknown>,
): AggregateNode {
  if (!(expression instanceof DefaultAggregateExpression)) {
    throw new TypeError(
      'Aggregate callbacks must return Aggregate Builder expressions.',
    );
  }
  return expression.toNode(alias);
}
