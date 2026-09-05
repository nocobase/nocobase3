import type {
  AnyRelationSelectBuilder,
  RelationSelectionExpression,
  RelationSelectResultNode,
  RelationCombineResult,
  RepositoryAggregateNumeric,
  RelationSelectBuilder,
  RepositoryFilter,
  RepositoryCursor,
  RepositoryCursorDirection,
  RepositoryRecord,
  RepositorySort,
  SelectBuilder,
} from './types.js';

export interface SelectBuilderIncludeState extends Omit<
  RelationSelectBuilderState,
  'kind'
> {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectBuilderState;
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: RepositorySort<RepositoryRecord>;
  readonly limit?: number;
  readonly cursor?: RepositoryCursor;
  readonly direction?: RepositoryCursorDirection;
}

export interface RelationSelectBuilderState extends SelectBuilderState {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: RepositorySort<RepositoryRecord>;
  readonly limit?: number;
  readonly cursor?: RepositoryCursor;
  readonly direction?: RepositoryCursorDirection;
  readonly distinct?: readonly string[];
  readonly result?:
    | Exclude<RelationSelectResultNode, { kind: 'combine' }>
    | {
        readonly kind: 'combine';
        readonly branches: Readonly<Record<string, RelationSelectBranchInput>>;
      };
}

export interface RelationSelectBranchInput extends Omit<
  RelationSelectBuilderState,
  'kind'
> {
  readonly select: SelectBuilderState;
}

export interface SelectBuilderState {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly includes?: readonly SelectBuilderIncludeState[];
}

export class DefaultSelectBuilder<
  TRecord extends object = RepositoryRecord,
> implements SelectBuilder<TRecord> {
  protected selectedFields: string[] = [];
  protected fieldsSpecified = false;
  protected includedRelations: SelectBuilderIncludeState[] = [];

  fields(...fields: readonly string[]): this {
    this.fieldsSpecified = true;
    this.selectedFields.push(...fields);
    return this;
  }

  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) =>
      AnyRelationSelectBuilder<TTarget> | RelationSelectionExpression<unknown>,
  ): this {
    return this.addInclude(relation, callback);
  }

  protected addInclude<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) =>
      AnyRelationSelectBuilder<TTarget> | RelationSelectionExpression<unknown>,
  ): this {
    const builder = new DefaultRelationSelectBuilder<TTarget>();
    const state = relationSelectionState(
      callback ? callback(builder) : builder,
    );
    this.includedRelations.push({
      ...state,
      kind: 'include',
      relation,
      select: {
        kind: 'selection',
        fields: state.fields,
        includes: state.includes,
      },
      filter: state.filter,
      sort: state.sort,
      limit: state.limit,
      cursor: state.cursor,
      direction: state.direction,
    });
    return this;
  }

  toState(): SelectBuilderState {
    return {
      kind: 'selection',
      fields: this.fieldsSpecified ? [...this.selectedFields] : undefined,
      includes: [...this.includedRelations],
    };
  }
}

export class DefaultRelationSelectBuilder<
  TRecord extends object = RepositoryRecord,
>
  extends DefaultSelectBuilder<TRecord>
  implements RelationSelectBuilder<TRecord>
{
  private relationFilter: RepositoryFilter<TRecord> | undefined;
  private relationSort: RepositorySort<TRecord> | undefined;
  private relationLimit: number | undefined;
  private relationCursor: RepositoryCursor<TRecord> | undefined;
  private relationDirection: RepositoryCursorDirection | undefined;
  private relationDistinct: readonly string[] | undefined;

  private clone(): this {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as this,
      this,
    );
    copy.selectedFields = [...this.selectedFields];
    copy.includedRelations = [...this.includedRelations];
    return copy;
  }

  override fields(...fields: readonly string[]): this {
    const copy = this.clone();
    copy.fieldsSpecified = true;
    copy.selectedFields.push(...fields);
    return copy;
  }

  override include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) =>
      AnyRelationSelectBuilder<TTarget> | RelationSelectionExpression<unknown>,
  ): this {
    const copy = this.clone();
    copy.addInclude(relation, callback);
    return copy;
  }

  distinct(fields: readonly (keyof TRecord & string)[]): this {
    const copy = this.clone();
    copy.relationDistinct = [...fields];
    return copy;
  }

  count(field?: keyof TRecord & string): RelationSelectionExpression<number> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'count',
      field,
    });
  }
  sum(
    field: keyof TRecord & string,
  ): RelationSelectionExpression<RepositoryAggregateNumeric | null> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'sum',
      field,
    });
  }
  avg(
    field: keyof TRecord & string,
  ): RelationSelectionExpression<RepositoryAggregateNumeric | null> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'avg',
      field,
    });
  }
  min<TKey extends keyof TRecord & string>(
    field: TKey,
  ): RelationSelectionExpression<TRecord[TKey] | null> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'min',
      field,
    });
  }
  max<TKey extends keyof TRecord & string>(
    field: TKey,
  ): RelationSelectionExpression<TRecord[TKey] | null> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'max',
      field,
    });
  }
  combine<
    const TBranches extends Readonly<
      Record<
        string,
        AnyRelationSelectBuilder<TRecord> | RelationSelectionExpression<unknown>
      >
    >,
  >(
    branches: TBranches,
  ): RelationSelectionExpression<RelationCombineResult<TRecord, TBranches>> {
    return new DefaultRelationSelectionExpression(this.toState(), {
      kind: 'combine',
      branches: Object.fromEntries(
        Object.entries(branches).map(([key, branch]) => {
          const state = relationSelectionState(branch);
          return [
            key,
            {
              ...state,
              select: {
                kind: 'selection',
                fields: state.fields,
                includes: state.includes,
              },
            },
          ];
        }),
      ),
    });
  }

  direction(direction: RepositoryCursorDirection): this {
    const copy = this.clone();
    copy.relationDirection = direction;
    return copy;
  }

  filter(filter: RepositoryFilter<TRecord>): this {
    const copy = this.clone();
    copy.relationFilter = filter;
    return copy;
  }

  sort(sort: RepositorySort<TRecord>): this {
    const copy = this.clone();
    copy.relationSort = sort;
    return copy;
  }

  limit(limit: number): this {
    const copy = this.clone();
    copy.relationLimit = limit;
    return copy;
  }

  cursor(cursor: RepositoryCursor<TRecord>): this {
    const copy = this.clone();
    copy.relationCursor = cursor;
    return copy;
  }

  override toState(): RelationSelectBuilderState {
    return {
      ...super.toState(),
      filter: this.relationFilter,
      sort: this.relationSort,
      limit: this.relationLimit,
      cursor: this.relationCursor as RepositoryCursor | undefined,
      direction: this.relationDirection,
      distinct: this.relationDistinct,
    };
  }
}

class DefaultRelationSelectionExpression<
  T,
> implements RelationSelectionExpression<T> {
  readonly kind = 'relationSelectionExpression' as const;
  constructor(
    private readonly state: RelationSelectBuilderState,
    private readonly result: NonNullable<RelationSelectBuilderState['result']>,
  ) {}
  toState(): RelationSelectBuilderState {
    return { ...this.state, result: this.result };
  }
}

function relationSelectionState(value: unknown): RelationSelectBuilderState {
  if (
    value instanceof DefaultRelationSelectBuilder ||
    value instanceof DefaultRelationSelectionExpression
  )
    return value.toState();
  throw new TypeError(
    'Relation selection callbacks must return a relation builder or expression.',
  );
}
