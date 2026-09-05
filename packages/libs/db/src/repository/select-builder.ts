import type {
  RelationSelectBuilder,
  RepositoryFilter,
  RepositoryRecord,
  SelectBuilder,
  SortAst,
} from './types.js';

export interface SelectBuilderIncludeState {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectBuilderState;
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: SortAst;
}

export interface RelationSelectBuilderState extends SelectBuilderState {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly sort?: SortAst;
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
  private relationSort: SortAst | undefined;

  filter(filter: RepositoryFilter<TRecord>): this {
    this.relationFilter = filter;
    return this;
  }

  sort(sort: SortAst): this {
    this.relationSort = sort;
    return this;
  }

  override toState(): RelationSelectBuilderState {
    return {
      ...super.toState(),
      filter: this.relationFilter,
      sort: this.relationSort,
    };
  }
}
