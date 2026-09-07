export type RepositoryMutationScalarValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Date
  | Uint8Array
  | Readonly<Record<string, unknown>>
  | readonly unknown[];

export type RepositoryRecord = Record<string, RepositoryMutationScalarValue>;

export type RepositoryContext = Readonly<Record<string, unknown>>;

export type MutationVariable = {
  readonly [K in keyof FilterVariable]: FilterVariable[K];
};

export type MutationLiteral<T = RepositoryMutationScalarValue> = {
  readonly kind: 'literal';
  readonly value: T;
};

export interface ValuesBuilder {
  variable(path: string): MutationVariable;
  literal<T extends RepositoryMutationScalarValue>(
    value: T,
  ): MutationLiteral<T>;
}

export type MutationValueInput<T> = T | MutationVariable | MutationLiteral<T>;

export type MutationValuesInput<T> = T | ((values: ValuesBuilder) => T);

export type ScalarCreateValues<T extends object> = {
  readonly [K in keyof T]: MutationValueInput<T[K]>;
};

export type NumericMutationOperand = number | bigint | string;

export type NumericMutationOperandInput =
  MutationValueInput<NumericMutationOperand>;

export type NumericMutationOperation =
  'increment' | 'decrement' | 'multiply' | 'divide';

export type NumericMutationJsonInput = {
  [TOperation in NumericMutationOperation]: Readonly<
    Record<TOperation, NumericMutationOperandInput> &
      Partial<Record<Exclude<NumericMutationOperation, TOperation>, never>>
  >;
}[NumericMutationOperation];

export interface NumericMutationBuilder {
  increment(value: NumericMutationOperandInput): NumericMutationJsonInput;
  decrement(value: NumericMutationOperandInput): NumericMutationJsonInput;
  multiply(value: NumericMutationOperandInput): NumericMutationJsonInput;
  divide(value: NumericMutationOperandInput): NumericMutationJsonInput;
}

export type NumericMutationInput =
  | NumericMutationJsonInput
  | ((value: NumericMutationBuilder) => NumericMutationJsonInput);

export type ScalarUpdateValues<TUpdate extends object> = {
  readonly [TKey in keyof TUpdate]:
    | MutationValueInput<TUpdate[TKey]>
    | (unknown extends TUpdate[TKey]
        ? NumericMutationInput
        : NonNullable<TUpdate[TKey]> extends number | bigint | string
          ? NumericMutationInput
          : never);
};

export type RepositoryPath = readonly string[];

export type FilterScalar = string | number | boolean | null;

export type FilterLiteral =
  | FilterScalar
  | readonly FilterLiteral[]
  | { readonly [key: string]: FilterLiteral };

export interface FilterVariable {
  readonly kind: 'variable';
  readonly path: string;
}

export type FilterValue =
  FilterLiteral | FilterVariable | readonly (FilterLiteral | FilterVariable)[];

export type FilterOperator =
  | '$jsonEq'
  | '$jsonNe'
  | '$jsonHas'
  | '$jsonHasSome'
  | '$jsonHasEvery'
  | '$jsonEmpty'
  | '$jsonNotEmpty'
  | '$jsonDbNull'
  | '$jsonNull'
  | '$jsonAnyNull'
  | '$includes'
  | '$notIncludes'
  | '$startsWith'
  | '$endsWith'
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$empty'
  | '$notEmpty'
  | '$dateOn'
  | '$dateNotOn'
  | '$dateBefore'
  | '$dateAfter'
  | '$dateNotBefore'
  | '$dateNotAfter'
  | '$dateBetween'
  | '$isTruly'
  | '$isFalsy';

export interface FilterGroupNode {
  readonly kind: 'group';
  readonly logic: 'and' | 'or';
  readonly items: readonly FilterNode[];
}

export interface FilterConditionNode {
  readonly kind: 'condition';
  readonly path: RepositoryPath;
  readonly operator: FilterOperator;
  readonly value?: FilterValue;
  readonly mode?: 'default' | 'insensitive';
  readonly jsonPath?: readonly (string | number)[];
}

export interface FilterRelationNode {
  readonly kind: 'relation';
  readonly path: RepositoryPath;
  readonly quantifier:
    'exists' | 'notExists' | 'some' | 'none' | 'empty' | 'notEmpty';
  readonly filter?: FilterGroupNode;
}

export type FilterNode =
  FilterGroupNode | FilterConditionNode | FilterRelationNode;

export interface FilterAst {
  readonly kind: 'filter';
  readonly version: 1;
  readonly collection?: string;
  readonly root: FilterGroupNode;
}

export type FilterFieldGroup =
  'string' | 'text' | 'number' | 'date' | 'time' | 'boolean' | 'json';

export type FilterOperand<T> = T | FilterVariable;

export interface EmptyFilterOperators {
  empty(): FilterConditionNode;
  notEmpty(): FilterConditionNode;
}

export interface StringFilterOperators extends EmptyFilterOperators {
  includes(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
  notIncludes(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
  startsWith(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
  endsWith(
    value: FilterOperand<string>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
  eq(
    value: FilterOperand<string | null>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
  ne(
    value: FilterOperand<string | null>,
    options?: StringFilterOptions,
  ): FilterConditionNode;
}

export interface StringFilterOptions {
  readonly mode?: 'default' | 'insensitive';
}

export type TextFilterOperators = StringFilterOperators;

export interface NumberFilterOperators extends EmptyFilterOperators {
  eq(value: FilterOperand<number | null>): FilterConditionNode;
  ne(value: FilterOperand<number | null>): FilterConditionNode;
  gt(value: FilterOperand<number>): FilterConditionNode;
  gte(value: FilterOperand<number>): FilterConditionNode;
  lt(value: FilterOperand<number>): FilterConditionNode;
  lte(value: FilterOperand<number>): FilterConditionNode;
}

export interface DateFilterOperators extends EmptyFilterOperators {
  on(value: FilterOperand<string | Date>): FilterConditionNode;
  notOn(value: FilterOperand<string | Date>): FilterConditionNode;
  before(value: FilterOperand<string | Date>): FilterConditionNode;
  after(value: FilterOperand<string | Date>): FilterConditionNode;
  notBefore(value: FilterOperand<string | Date>): FilterConditionNode;
  notAfter(value: FilterOperand<string | Date>): FilterConditionNode;
  between(
    value: readonly [
      FilterOperand<string | Date>,
      FilterOperand<string | Date>,
    ],
  ): FilterConditionNode;
}

export interface TimeFilterOperators extends EmptyFilterOperators {
  eq(value: FilterOperand<string | null>): FilterConditionNode;
  ne(value: FilterOperand<string | null>): FilterConditionNode;
}

export interface BooleanFilterOperators extends EmptyFilterOperators {
  isTrue(): FilterConditionNode;
  isFalse(): FilterConditionNode;
}

export interface JsonFilterOperators {
  path(path: readonly (string | number)[]): JsonFilterOperators;
  eq(value: FilterOperand<FilterLiteral>): FilterConditionNode;
  ne(value: FilterOperand<FilterLiteral>): FilterConditionNode;
  has(value: FilterOperand<FilterScalar>): FilterConditionNode;
  hasSome(value: FilterOperand<readonly FilterScalar[]>): FilterConditionNode;
  hasEvery(value: FilterOperand<readonly FilterScalar[]>): FilterConditionNode;
  isEmpty(): FilterConditionNode;
  isNotEmpty(): FilterConditionNode;
  isDbNull(): FilterConditionNode;
  isJsonNull(): FilterConditionNode;
  isAnyNull(): FilterConditionNode;
}

export interface RelationFilterOperators<TTarget extends object> {
  some(
    callback: (filter: FilterBuilder<TTarget>) => FilterNode,
  ): FilterRelationNode;
  none(
    callback: (filter: FilterBuilder<TTarget>) => FilterNode,
  ): FilterRelationNode;
  exists(): FilterRelationNode;
  notExists(): FilterRelationNode;
  empty(): FilterRelationNode;
  notEmpty(): FilterRelationNode;
}

export interface FilterBuilder<_TRecord extends object = RepositoryRecord> {
  and(items: readonly FilterNode[]): FilterGroupNode;
  or(items: readonly FilterNode[]): FilterGroupNode;
  variable(path: string): FilterVariable;
  string(path: string | RepositoryPath): StringFilterOperators;
  text(path: string | RepositoryPath): TextFilterOperators;
  number(path: string | RepositoryPath): NumberFilterOperators;
  date(path: string | RepositoryPath): DateFilterOperators;
  time(path: string | RepositoryPath): TimeFilterOperators;
  boolean(path: string | RepositoryPath): BooleanFilterOperators;
  json(path: string | RepositoryPath): JsonFilterOperators;
  relation<TTarget extends object = RepositoryRecord>(
    path: string | RepositoryPath,
  ): RelationFilterOperators<TTarget>;
}

export type FilterShorthandValue = string | number | boolean | null;

export type FilterShorthand<TRecord extends object> = Readonly<
  Partial<{
    [TKey in keyof TRecord]: FilterShorthandValue;
  }>
>;

export type RepositoryFilter<TRecord extends object> =
  | FilterShorthand<TRecord>
  | FilterAst
  | ((filter: FilterBuilder<TRecord>) => FilterNode);

export interface SelectNode {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly includes?: readonly SelectIncludeNode[];
}

export interface RelationSelectBranchNode {
  readonly select: SelectNode;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
  readonly limit?: number;
  readonly cursor?: RepositoryCursor;
  readonly direction?: RepositoryCursorDirection;
  readonly distinct?: readonly string[];
  readonly result?: RelationSelectResultNode;
}

export type RelationSelectResultNode =
  | { readonly kind: 'count'; readonly field?: string }
  | { readonly kind: 'sum' | 'avg' | 'min' | 'max'; readonly field: string }
  | {
      readonly kind: 'combine';
      readonly branches: Readonly<Record<string, RelationSelectBranchNode>>;
    };

export interface SelectIncludeNode extends RelationSelectBranchNode {
  readonly kind: 'include';
  readonly relation: string;
}

export interface SelectAst {
  readonly kind: 'select';
  readonly version: 1;
  readonly collection?: string;
  readonly root: SelectNode;
}

declare const selectBuilderState: unique symbol;

export interface SelectBuilder<
  TRecord extends object = RepositoryRecord,
  TSelectedKeys extends keyof TRecord = never,
  THasFields extends boolean = false,
  THasIncludes extends boolean = false,
  TRelationResults extends object = Record<never, never>,
> {
  readonly [selectBuilderState]?: {
    readonly selectedKeys: TSelectedKeys;
    readonly hasFields: THasFields;
    readonly hasIncludes: THasIncludes;
    readonly relationResults: TRelationResults;
  };
  fields<const TFields extends readonly (keyof TRecord & string)[]>(
    ...fields: TFields
  ): SelectBuilder<
    TRecord,
    TSelectedKeys | TFields[number],
    true,
    THasIncludes,
    TRelationResults
  >;
  include<const TName extends string, TResult>(
    relation: TName,
    callback: (
      select: RelationSelectBuilder,
    ) => RelationSelectionExpression<TResult>,
  ): SelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults & Record<TName, TResult>
  >;
  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) =>
      AnyRelationSelectBuilder<TTarget> | RelationSelectionExpression<unknown>,
  ): SelectBuilder<TRecord, TSelectedKeys, THasFields, true, TRelationResults>;
}

export interface RelationSelectBuilder<
  TRecord extends object = RepositoryRecord,
  TSelectedKeys extends keyof TRecord = never,
  THasFields extends boolean = false,
  THasIncludes extends boolean = false,
  TRelationResults extends object = Record<never, never>,
> extends SelectBuilder<
  TRecord,
  TSelectedKeys,
  THasFields,
  THasIncludes,
  TRelationResults
> {
  fields<const TFields extends readonly (keyof TRecord & string)[]>(
    ...fields: TFields
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys | TFields[number],
    true,
    THasIncludes,
    TRelationResults
  >;
  include<const TName extends string, TResult>(
    relation: TName,
    callback: (
      select: RelationSelectBuilder,
    ) => RelationSelectionExpression<TResult>,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults & Record<TName, TResult>
  >;
  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) =>
      AnyRelationSelectBuilder<TTarget> | RelationSelectionExpression<unknown>,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    true,
    TRelationResults
  >;
  filter(
    filter: RepositoryFilter<TRecord>,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  sort(
    sort: RepositorySort<TRecord>,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  limit(
    limit: number,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  cursor(
    cursor: RepositoryCursor<TRecord>,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  direction(
    direction: RepositoryCursorDirection,
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  distinct(
    fields: readonly (keyof TRecord & string)[],
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys,
    THasFields,
    THasIncludes,
    TRelationResults
  >;
  count(field?: keyof TRecord & string): RelationSelectionExpression<number>;
  sum(
    field: keyof TRecord & string,
  ): RelationSelectionExpression<RepositoryAggregateNumeric | null>;
  avg(
    field: keyof TRecord & string,
  ): RelationSelectionExpression<RepositoryAggregateNumeric | null>;
  min<TKey extends keyof TRecord & string>(
    field: TKey,
  ): RelationSelectionExpression<TRecord[TKey] | null>;
  max<TKey extends keyof TRecord & string>(
    field: TKey,
  ): RelationSelectionExpression<TRecord[TKey] | null>;
  combine<
    const TBranches extends Readonly<
      Record<
        string,
        AnyRelationSelectBuilder<TRecord> | RelationSelectionExpression<unknown>
      >
    >,
  >(
    branches: TBranches,
  ): RelationSelectionExpression<RelationCombineResult<TRecord, TBranches>>;
}

declare const relationSelectionType: unique symbol;
export interface RelationSelectionExpression<T> {
  readonly kind: 'relationSelectionExpression';
  readonly [relationSelectionType]?: T;
}
export type RelationCombineResult<TRecord extends object, TBranches> = {
  readonly [
    K in keyof TBranches
  ]: TBranches[K] extends RelationSelectionExpression<infer T>
    ? T
    : TBranches[K] extends AnySelectBuilder<TRecord>
      ? SelectedBuilderRecord<TRecord, TBranches[K]>[]
      : never;
};

export type AnySelectBuilder<TRecord extends object> = SelectBuilder<
  TRecord,
  keyof TRecord,
  boolean,
  boolean,
  object
>;

export type AnyRelationSelectBuilder<TRecord extends object> =
  RelationSelectBuilder<TRecord, keyof TRecord, boolean, boolean, object>;

export type SelectedBuilderRecord<
  TRecord extends object,
  TSelection extends AnySelectBuilder<TRecord>,
> =
  TSelection extends SelectBuilder<
    TRecord,
    infer TSelectedKeys,
    infer THasFields,
    infer THasIncludes,
    infer TRelationResults
  >
    ? THasIncludes extends true
      ? MergeRelationResults<TRecord, TRelationResults>
      : THasFields extends true
        ? MergeRelationResults<Pick<TRecord, TSelectedKeys>, TRelationResults>
        : MergeRelationResults<TRecord, TRelationResults>
    : TRecord;

type MergeRelationResults<TRecord, TRelations> = keyof TRelations extends never
  ? TRecord
  : Omit<TRecord, keyof TRelations> & TRelations;

export type RepositorySelect<TRecord extends object> =
  SelectAst | ((select: SelectBuilder<TRecord>) => AnySelectBuilder<TRecord>);

export type SortDirection = 'asc' | 'desc';

export type SortNullsPosition = 'first' | 'last';

export interface SortFieldNode {
  readonly kind: 'field';
  readonly path: RepositoryPath;
  readonly direction: SortDirection;
  readonly nulls?: SortNullsPosition;
}

export type SortAggregateNode =
  | {
      readonly kind: 'aggregate';
      readonly relation: RepositoryPath;
      readonly aggregate: 'count';
      readonly field?: never;
      readonly direction: SortDirection;
      readonly nulls?: SortNullsPosition;
    }
  | {
      readonly kind: 'aggregate';
      readonly relation: RepositoryPath;
      readonly aggregate: 'sum' | 'avg' | 'min' | 'max';
      readonly field: string;
      readonly direction: SortDirection;
      readonly nulls?: SortNullsPosition;
    };

export type SortNode = SortFieldNode | SortAggregateNode;

export interface SortAst {
  readonly kind: 'sort';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly SortNode[];
}

export interface NonEmptySortAst extends SortAst {
  readonly items: readonly [SortNode, ...SortNode[]];
}

export interface SortExpression {
  readonly kind: 'sortExpression';
}

export interface SortNullsBuilder extends SortExpression {
  nullsFirst(): SortExpression;
  nullsLast(): SortExpression;
}

export interface SortFieldBuilder {
  asc(): SortNullsBuilder;
  desc(): SortNullsBuilder;
}

export interface SortAggregateBuilder {
  asc(): SortNullsBuilder;
  desc(): SortNullsBuilder;
}

export interface SortRelationBuilder {
  count(): SortAggregateBuilder;
  sum(field: string): SortAggregateBuilder;
  avg(field: string): SortAggregateBuilder;
  min(field: string): SortAggregateBuilder;
  max(field: string): SortAggregateBuilder;
}

export interface SortBuilder<_TRecord extends object = RepositoryRecord> {
  field(path: string | RepositoryPath): SortFieldBuilder;
  relation(path: string | RepositoryPath): SortRelationBuilder;
}

export type RepositorySort<TRecord extends object> =
  | SortAst
  | ((
      sort: SortBuilder<TRecord>,
    ) => SortExpression | readonly SortExpression[]);

export type NonEmptyRepositorySort<TRecord extends object> =
  | NonEmptySortAst
  | ((
      sort: SortBuilder<TRecord>,
    ) => SortExpression | readonly [SortExpression, ...SortExpression[]]);

export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type AggregateNode =
  | {
      readonly kind: 'count';
      readonly alias: string;
      readonly field?: string;
    }
  | {
      readonly kind: Exclude<AggregateFunction, 'count'>;
      readonly alias: string;
      readonly field: string;
    };

export interface AggregateAst {
  readonly kind: 'aggregate';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly AggregateNode[];
}

declare const aggregateExpressionType: unique symbol;

export interface AggregateExpression<T = unknown> {
  readonly kind: 'aggregateExpression';
  readonly [aggregateExpressionType]?: T;
}

export type RepositoryAggregateNumeric = number | string | bigint;

export interface AggregateBuilder<TRecord extends object = RepositoryRecord> {
  count(field?: keyof TRecord & string): AggregateExpression<number>;
  sum(
    field: keyof TRecord & string,
  ): AggregateExpression<RepositoryAggregateNumeric | null>;
  avg(
    field: keyof TRecord & string,
  ): AggregateExpression<RepositoryAggregateNumeric | null>;
  min<TKey extends keyof TRecord & string>(
    field: TKey,
  ): AggregateExpression<TRecord[TKey] | null>;
  max<TKey extends keyof TRecord & string>(
    field: TKey,
  ): AggregateExpression<TRecord[TKey] | null>;
}

export type AggregateSelection = Readonly<
  Record<string, AggregateExpression<unknown>>
>;

export type AggregateSelectionResult<TSelection extends AggregateSelection> = {
  readonly [
    TKey in keyof TSelection
  ]: TSelection[TKey] extends AggregateExpression<infer TValue>
    ? TValue
    : never;
};

export type AggregateResult = Readonly<
  Record<string, RepositoryMutationScalarValue>
>;

export interface AggregateOptions<TRecord extends object> {
  readonly filter?: RepositoryFilter<TRecord>;
  readonly aggregate:
    | AggregateAst
    | ((aggregate: AggregateBuilder<TRecord>) => AggregateSelection);
  readonly context?: RepositoryContext;
}

export type GroupByResult = Readonly<
  Record<string, RepositoryMutationScalarValue>
>;

export type GroupBySelectionResult<
  TRecord extends object,
  TBy extends readonly (keyof TRecord & string)[],
  TSelection extends AggregateSelection,
> = Readonly<Pick<TRecord, TBy[number]>> & AggregateSelectionResult<TSelection>;

export interface GroupByOptions<
  TRecord extends object,
  TResult extends object = RepositoryRecord,
> {
  readonly by: readonly [keyof TRecord & string, ...(keyof TRecord & string)[]];
  readonly aggregate:
    | AggregateAst
    | ((aggregate: AggregateBuilder<TRecord>) => AggregateSelection);
  readonly filter?: RepositoryFilter<TRecord>;
  readonly having?: RepositoryFilter<TResult>;
  readonly sort?: RepositorySort<TResult>;
  readonly context?: RepositoryContext;
}

export interface UniqueSelector {
  readonly kind: 'unique';
  readonly fields: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
}

export interface RelationMutationAst {
  readonly kind: 'relationMutation';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly RelationMutationNode[];
}

export type RelationMutationNode =
  | RelationSetNode
  | RelationClearNode
  | RelationPatchNode
  | RelationReplaceNode
  | RelationModifyNode;

export interface RelationSetNode {
  readonly kind: 'relation';
  readonly field: string;
  readonly action: 'set';
  readonly target: ConnectTarget | CreateTarget;
}

export interface RelationClearNode {
  readonly kind: 'relation';
  readonly field: string;
  readonly action: 'clear';
}

export interface RelationPatchNode {
  readonly kind: 'relation';
  readonly field: string;
  readonly action: 'patch';
  readonly connect?: readonly ConnectTarget[];
  readonly create?: readonly CreateTarget[];
  readonly disconnect?: readonly UniqueSelector[];
  readonly update?: readonly RelationUpdateTarget[];
  readonly upsert?: readonly RelationUpsertTarget[];
  readonly delete?: readonly RelationDeleteTarget[];
}

export interface RelationModifyNode {
  readonly kind: 'relation';
  readonly field: string;
  readonly action: 'modify';
  readonly update?: RelationUpdateTarget;
  readonly upsert?: RelationUpsertTarget;
  readonly delete?: RelationDeleteTarget;
}

export interface RelationReplaceNode {
  readonly kind: 'relation';
  readonly field: string;
  readonly action: 'replace';
  readonly targets: readonly (ConnectTarget | CreateTarget)[];
}

export interface ConnectTarget {
  readonly kind: 'connect';
  readonly by: UniqueSelector;
  readonly through?: RepositoryRecord;
}

export interface CreateTarget {
  readonly kind: 'create';
  readonly clientKey?: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly relations?: RelationMutationAst;
  readonly through?: RepositoryRecord;
}

export interface RelationUpdateTarget {
  readonly filter?: FilterAst;
  readonly values: Readonly<Record<string, unknown>>;
  readonly relations?: RelationMutationAst;
}

export interface RelationUpsertTarget {
  readonly filter?: FilterAst;
  readonly by?: UniqueSelector;
  readonly create: CreateTarget;
  readonly update: RelationUpdateTarget;
}

export interface RelationDeleteTarget {
  readonly filter?: FilterAst;
}

export interface NestedCreateOptions {
  readonly clientKey?: string;
  readonly through?: RepositoryRecord;
}

export type RelationConnectInput = {
  readonly where: RelationTargetSelector;
  readonly through: RepositoryRecord;
};

export interface RelationCreateTargetInput {
  readonly kind: 'relationCreate';
  readonly version: 1;
  readonly values: RelationCreateValues;
  readonly clientKey?: string;
  readonly through?: RepositoryRecord;
}

export type RelationCreateInput =
  | RelationCreateTargetInput
  | {
      readonly values: RelationCreateValues;
      readonly through: RepositoryRecord;
    };

export type RelationTargetSelector = Readonly<Record<string, unknown>>;

export type RelationTargetSelectorInput =
  | RelationTargetSelector
  | RelationConnectInput
  | readonly (RelationTargetSelector | RelationConnectInput)[];

export type RelationCreateValues = Readonly<
  Record<
    string,
    | RepositoryMutationScalarValue
    | MutationVariable
    | MutationLiteral
    | CreateRelationFieldMutationInput
  >
>;

export type RelationCreateValuesInput =
  | RelationCreateValues
  | RelationCreateInput
  | readonly (RelationCreateValues | RelationCreateInput)[];

export type RelationUpdateValues = Readonly<
  Record<string, DynamicUpdateMutationInput>
>;

export interface RelationUpdateInput {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly values: RelationUpdateValues;
}

export interface RelationUpsertInput {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
  readonly create: RelationCreateValues;
  readonly update: RelationUpdateValues;
}

export interface RelationDeleteInput {
  readonly filter?: RepositoryFilter<RepositoryRecord>;
}

export type RelationUpdateInputList =
  RelationUpdateInput | readonly RelationUpdateInput[];

export type RelationUpsertInputList =
  RelationUpsertInput | readonly RelationUpsertInput[];

export type RelationDeleteInputList =
  RelationDeleteInput | readonly RelationDeleteInput[];

export interface CreateRelationFieldMutationJsonInput {
  readonly create?: RelationCreateValuesInput;
  readonly connect?: RelationTargetSelectorInput;
}

export type UpdateRelationFieldMutationJsonInput =
  | {
      readonly set: readonly RelationTargetSelector[];
      readonly create?: never;
      readonly connect?: never;
      readonly disconnect?: never;
      readonly update?: never;
      readonly upsert?: never;
      readonly delete?: never;
    }
  | {
      readonly set?: never;
      readonly create?: RelationCreateValuesInput;
      readonly connect?: RelationTargetSelectorInput;
      readonly disconnect?: true | RelationTargetSelectorInput;
      readonly update?: RelationUpdateInputList;
      readonly upsert?: RelationUpsertInputList;
      readonly delete?: true | RelationDeleteInputList;
    };

export interface CreateRelationFieldMutationBuilder {
  create(values: RelationCreateValues, options?: NestedCreateOptions): this;
  connect(
    values: RelationTargetSelector,
    options?: Pick<NestedCreateOptions, 'through'>,
  ): this;
}

export interface UpdateRelationFieldMutationBuilder extends CreateRelationFieldMutationBuilder {
  disconnect(values?: RelationTargetSelector): this;
  set(values: readonly RelationTargetSelector[]): this;
  update(input: RelationUpdateInput): this;
  upsert(input: RelationUpsertInput): this;
  delete(input?: RelationDeleteInput): this;
}

export type CreateRelationFieldMutationInput =
  | CreateRelationFieldMutationJsonInput
  | ((
      relation: CreateRelationFieldMutationBuilder,
    ) => CreateRelationFieldMutationBuilder);

export type UpdateRelationFieldMutationInput =
  | UpdateRelationFieldMutationJsonInput
  | ((
      relation: UpdateRelationFieldMutationBuilder,
    ) => UpdateRelationFieldMutationBuilder);

type CreateMutationProperty<T> = unknown extends T
  ? RepositoryMutationScalarValue | CreateRelationFieldMutationInput
  : T extends object
    ? T | CreateRelationFieldMutationInput
    : T;

type UpdateMutationProperty<T> = RepositoryMutationScalarValue extends T
  ? DynamicUpdateMutationInput
  : [NonNullable<T>] extends [object]
    ? T | UpdateRelationFieldMutationInput
    : NonNullable<T> extends number | bigint | string
      ? T | NumericMutationInput
      : T;

/** Collection metadata determines the callback's scalar or relation capabilities at runtime. */
export type DynamicUpdateMutationInput =
  | RepositoryMutationScalarValue
  | MutationVariable
  | MutationLiteral
  | UpdateRelationFieldMutationJsonInput
  | NumericMutationJsonInput
  | ((
      value: UpdateRelationFieldMutationBuilder & NumericMutationBuilder,
    ) => UpdateRelationFieldMutationBuilder | NumericMutationJsonInput);

export type CreateMutationValues<TCreate extends object> = {
  readonly [TKey in keyof TCreate]:
    | CreateMutationProperty<TCreate[TKey]>
    | MutationVariable
    | MutationLiteral<TCreate[TKey]>;
};

export type UpdateMutationValues<TUpdate extends object> = {
  readonly [TKey in keyof TUpdate]:
    | UpdateMutationProperty<TUpdate[TKey]>
    | MutationVariable
    | MutationLiteral<TUpdate[TKey]>;
};

export type RepositoryCursor<TRecord extends object = RepositoryRecord> =
  Readonly<Partial<TRecord>>;

export type RepositoryCursorDirection = 'forward' | 'backward';
