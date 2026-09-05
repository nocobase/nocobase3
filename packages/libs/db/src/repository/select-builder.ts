import type {
  RelationSelectBuilder,
  RepositoryFilter,
  RepositoryCursor,
  RepositoryRecord,
  RepositorySort,
  SelectBuilder,
} from './types.js';

export interface SelectBuilderIncludeState {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectBuilderState;
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: RepositorySort<RepositoryRecord>;
  readonly limit?: number;
  readonly cursor?: RepositoryCursor;
}

export interface RelationSelectBuilderState extends SelectBuilderState {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: RepositorySort<RepositoryRecord>;
  readonly limit?: number;
  readonly cursor?: RepositoryCursor;
}

export interface SelectBuilderState {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly includes?: readonly SelectBuilderIncludeState[];
}

export class DefaultSelectBuilder<
  TRecord extends object = RepositoryRecord,
> implements SelectBuilder<TRecord> {
  private readonly selectedFields: string[] = [];
  private fieldsSpecified = false;
  private readonly includedRelations: SelectBuilderIncludeState[] = [];

  fields(...fields: readonly string[]): this {
    this.fieldsSpecified = true;
    this.selectedFields.push(...fields);
    return this;
  }

  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) => RelationSelectBuilder<TTarget>,
  ): this {
    const builder = new DefaultRelationSelectBuilder<TTarget>();
    if (callback) callback(builder);
    const state = builder.toState();
    this.includedRelations.push({
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

  filter(filter: RepositoryFilter<TRecord>): this {
    this.relationFilter = filter;
    return this;
  }

  sort(sort: RepositorySort<TRecord>): this {
    this.relationSort = sort;
    return this;
  }

  limit(limit: number): this {
    this.relationLimit = limit;
    return this;
  }

  cursor(cursor: RepositoryCursor<TRecord>): this {
    this.relationCursor = cursor;
    return this;
  }

  override toState(): RelationSelectBuilderState {
    return {
      ...super.toState(),
      filter: this.relationFilter,
      sort: this.relationSort,
      limit: this.relationLimit,
      cursor: this.relationCursor as RepositoryCursor | undefined,
    };
  }
}
