import type { RepositoryErrorCode } from './errors.js';

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
  | '$includes'
  | '$notIncludes'
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
  includes(value: FilterOperand<string>): FilterConditionNode;
  notIncludes(value: FilterOperand<string>): FilterConditionNode;
  eq(value: FilterOperand<string | null>): FilterConditionNode;
  ne(value: FilterOperand<string | null>): FilterConditionNode;
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

/** JSON has no portable filter operators in Repository V1. */
export type JsonFilterOperators = Readonly<Record<never, never>>;

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

export interface SelectIncludeNode {
  readonly kind: 'include';
  readonly relation: string;
  readonly select: SelectNode;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
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
> {
  readonly [selectBuilderState]?: {
    readonly selectedKeys: TSelectedKeys;
    readonly hasFields: THasFields;
    readonly hasIncludes: THasIncludes;
  };
  fields<const TFields extends readonly (keyof TRecord & string)[]>(
    ...fields: TFields
  ): SelectBuilder<
    TRecord,
    TSelectedKeys | TFields[number],
    true,
    THasIncludes
  >;
  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) => AnyRelationSelectBuilder<TTarget>,
  ): SelectBuilder<TRecord, TSelectedKeys, THasFields, true>;
}

export interface RelationSelectBuilder<
  TRecord extends object = RepositoryRecord,
  TSelectedKeys extends keyof TRecord = never,
  THasFields extends boolean = false,
  THasIncludes extends boolean = false,
> extends SelectBuilder<TRecord, TSelectedKeys, THasFields, THasIncludes> {
  fields<const TFields extends readonly (keyof TRecord & string)[]>(
    ...fields: TFields
  ): RelationSelectBuilder<
    TRecord,
    TSelectedKeys | TFields[number],
    true,
    THasIncludes
  >;
  include<TTarget extends object = RepositoryRecord>(
    relation: string,
    callback?: (
      select: RelationSelectBuilder<TTarget>,
    ) => AnyRelationSelectBuilder<TTarget>,
  ): RelationSelectBuilder<TRecord, TSelectedKeys, THasFields, true>;
  filter(
    filter: RepositoryFilter<TRecord>,
  ): RelationSelectBuilder<TRecord, TSelectedKeys, THasFields, THasIncludes>;
  sort(
    sort: RepositorySort<TRecord>,
  ): RelationSelectBuilder<TRecord, TSelectedKeys, THasFields, THasIncludes>;
}

export type AnySelectBuilder<TRecord extends object> = SelectBuilder<
  TRecord,
  keyof TRecord,
  boolean,
  boolean
>;

export type AnyRelationSelectBuilder<TRecord extends object> =
  RelationSelectBuilder<TRecord, keyof TRecord, boolean, boolean>;

export type SelectedBuilderRecord<
  TRecord extends object,
  TSelection extends AnySelectBuilder<TRecord>,
> =
  TSelection extends SelectBuilder<
    TRecord,
    infer TSelectedKeys,
    infer THasFields,
    infer THasIncludes
  >
    ? THasIncludes extends true
      ? TRecord
      : THasFields extends true
        ? Pick<TRecord, TSelectedKeys>
        : TRecord
    : TRecord;

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
}

export interface CreateTarget {
  readonly kind: 'create';
  readonly clientKey?: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly relations?: RelationMutationAst;
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
}

export type RelationTargetSelector = Readonly<Record<string, unknown>>;

export type RelationTargetSelectorInput =
  RelationTargetSelector | readonly RelationTargetSelector[];

export type RelationCreateValues = Readonly<
  Record<
    string,
    RepositoryMutationScalarValue | CreateRelationFieldMutationInput
  >
>;

export type RelationCreateValuesInput =
  RelationCreateValues | readonly RelationCreateValues[];

export type RelationUpdateValues = Readonly<
  Record<
    string,
    RepositoryMutationScalarValue | UpdateRelationFieldMutationInput
  >
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
  connect(values: RelationTargetSelector): this;
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

type UpdateMutationProperty<T> = unknown extends T
  ? RepositoryMutationScalarValue | UpdateRelationFieldMutationInput
  : T extends object
    ? T | UpdateRelationFieldMutationInput
    : T;

export type CreateMutationValues<TCreate extends object> = {
  readonly [TKey in keyof TCreate]: CreateMutationProperty<TCreate[TKey]>;
};

export type UpdateMutationValues<TUpdate extends object> = {
  readonly [TKey in keyof TUpdate]: UpdateMutationProperty<TUpdate[TKey]>;
};

export interface RepositoryReadOptions<
  TRecord extends object = RepositoryRecord,
> {
  readonly select?: RepositorySelect<TRecord>;
  readonly context?: RepositoryContext;
}

export interface FindManyOptions<
  TRecord extends object,
> extends RepositoryReadOptions<TRecord> {
  readonly filter?: RepositoryFilter<TRecord>;
  readonly sort?: RepositorySort<TRecord>;
  readonly limit?: number;
  readonly offset?: number;
}

export type FindOneOptions<TRecord extends object> =
  RepositoryReadOptions<TRecord> &
    (
      | {
          readonly filter: RepositoryFilter<TRecord>;
          readonly sort?: RepositorySort<TRecord>;
        }
      | {
          readonly filter?: RepositoryFilter<TRecord>;
          readonly sort: NonEmptyRepositorySort<TRecord>;
        }
    );

export interface FilterOnlyOptions<TRecord extends object> {
  readonly filter?: RepositoryFilter<TRecord>;
  readonly context?: RepositoryContext;
}

export interface CreateOneOptions<
  TCreate extends object,
  TRecord extends object = RepositoryRecord,
> {
  readonly values: CreateMutationValues<TCreate>;
  readonly select?: RepositorySelect<TRecord>;
}

export interface CreateManyOptions<TCreate extends object> {
  readonly values: readonly [TCreate, ...TCreate[]];
}

export interface SingleMutationSelector<TRecord extends object> {
  readonly filter: RepositoryFilter<TRecord>;
}

export type UpdateOneOptions<
  TUpdate extends object,
  TRecord extends object = RepositoryRecord,
> = SingleMutationSelector<TRecord> & {
  readonly select?: RepositorySelect<TRecord>;
  readonly ifVersion?: string | number;
  readonly context?: RepositoryContext;
  readonly values: UpdateMutationValues<TUpdate>;
};

export type UpsertOneOptions<
  TCreate extends object,
  TUpdate extends object,
  TRecord extends object = RepositoryRecord,
> = SingleMutationSelector<TRecord> & {
  readonly create: CreateMutationValues<TCreate>;
  readonly update: UpdateMutationValues<TUpdate>;
  readonly select?: RepositorySelect<TRecord>;
  readonly ifVersion?: string | number;
  readonly context?: RepositoryContext;
};

export type MutationScope<TRecord extends object> =
  | {
      readonly filter: RepositoryFilter<TRecord>;
      readonly all?: never;
    }
  | {
      readonly filter?: never;
      readonly all: true;
    };

export type UpdateManyOptions<
  TRecord extends object,
  TUpdate extends object,
> = MutationScope<TRecord> & {
  readonly values: TUpdate;
  readonly context?: RepositoryContext;
};

export type DeleteOneOptions<TRecord extends object = RepositoryRecord> =
  SingleMutationSelector<TRecord> & {
    readonly select?: RepositorySelect<TRecord>;
    readonly ifVersion?: string | number;
    readonly context?: RepositoryContext;
  };

export type DeleteManyOptions<TRecord extends object> =
  MutationScope<TRecord> & {
    readonly context?: RepositoryContext;
  };

export interface CreatedTargetReference {
  readonly clientKey: string;
  readonly collection: string;
  readonly unique: UniqueSelector;
}

export interface SingleMutationResult<TResult> {
  readonly record: TResult;
  readonly createdTargets: readonly CreatedTargetReference[];
  readonly version?: string | number;
}

export interface CreateManyResult {
  readonly createdCount: number;
}

export interface UpdateManyResult {
  readonly updatedCount: number;
}

export type DeleteOneResult<TResult = never> = [TResult] extends [never]
  ? { readonly deleted: true }
  : { readonly deleted: true; readonly record: TResult };

export interface DeleteManyResult {
  readonly deletedCount: number;
}

export interface DescribeMutationOptions {
  readonly operation: 'createOne' | 'updateOne';
}

export type ValidateMutationOptions<
  TCreate extends object,
  TUpdate extends object,
  TRecord extends object = RepositoryRecord,
> =
  | {
      readonly operation: 'createOne';
      readonly values: CreateMutationValues<TCreate>;
    }
  | ({
      readonly operation: 'updateOne';
      readonly ifVersion?: string | number;
      readonly context?: RepositoryContext;
      readonly values: UpdateMutationValues<TUpdate>;
    } & SingleMutationSelector<TRecord>);

export interface RepositoryUniqueFieldSetDescription {
  readonly fields: readonly string[];
  readonly primary: boolean;
}

export interface RepositoryRelationMutationDescription {
  readonly field: string;
  readonly cardinality: 'one' | 'many';
  readonly targetCollection: string;
  readonly allowedActions: readonly (
    'set' | 'clear' | 'patch' | 'replace' | 'modify'
  )[];
  readonly modifyOperations?: readonly ('update' | 'upsert' | 'delete')[];
  readonly patchOperations?: readonly (
    'connect' | 'create' | 'disconnect' | 'update' | 'upsert' | 'delete'
  )[];
  readonly uniqueFieldSets: readonly RepositoryUniqueFieldSetDescription[];
}

export interface RepositoryMutationDescription {
  readonly collection: string;
  readonly operation: 'createOne' | 'updateOne';
  readonly relations: readonly RepositoryRelationMutationDescription[];
  readonly limits: {
    readonly maxDepth: number;
    readonly maxNodes: number;
  };
}

export interface MutationValidationError {
  readonly code: RepositoryErrorCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly collection?: string;
  readonly field?: string;
  readonly relation?: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface MutationValidationResult {
  readonly valid: boolean;
  readonly errors: readonly MutationValidationError[];
}

export interface Repository<
  TRecord extends object = RepositoryRecord,
  TCreate extends object = Partial<TRecord>,
  TUpdate extends object = Partial<TRecord>,
> {
  findMany<TSelection extends AnySelectBuilder<TRecord>>(
    options: FindManyOptions<TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<SelectedBuilderRecord<TRecord, TSelection>[]>;
  findMany(options?: FindManyOptions<TRecord>): Promise<TRecord[]>;
  findOne<TSelection extends AnySelectBuilder<TRecord>>(
    options: FindOneOptions<TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<SelectedBuilderRecord<TRecord, TSelection> | undefined>;
  findOne(options: FindOneOptions<TRecord>): Promise<TRecord | undefined>;
  count(options?: FilterOnlyOptions<TRecord>): Promise<number>;
  exists(options?: FilterOnlyOptions<TRecord>): Promise<boolean>;
  describeMutation(
    options: DescribeMutationOptions,
  ): Promise<RepositoryMutationDescription>;
  validateMutation(
    options: ValidateMutationOptions<TCreate, TUpdate, TRecord>,
  ): Promise<MutationValidationResult>;
  createOne<TSelection extends AnySelectBuilder<TRecord>>(
    options: CreateOneOptions<TCreate, TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<SingleMutationResult<SelectedBuilderRecord<TRecord, TSelection>>>;
  createOne(
    options: CreateOneOptions<TCreate, TRecord>,
  ): Promise<SingleMutationResult<TRecord>>;
  createMany(options: CreateManyOptions<TCreate>): Promise<CreateManyResult>;
  updateOne<TSelection extends AnySelectBuilder<TRecord>>(
    options: UpdateOneOptions<TUpdate, TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<SingleMutationResult<SelectedBuilderRecord<TRecord, TSelection>>>;
  updateOne(
    options: UpdateOneOptions<TUpdate, TRecord>,
  ): Promise<SingleMutationResult<TRecord>>;
  upsertOne<TSelection extends AnySelectBuilder<TRecord>>(
    options: UpsertOneOptions<TCreate, TUpdate, TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<SingleMutationResult<SelectedBuilderRecord<TRecord, TSelection>>>;
  upsertOne(
    options: UpsertOneOptions<TCreate, TUpdate, TRecord>,
  ): Promise<SingleMutationResult<TRecord>>;
  updateMany(
    options: UpdateManyOptions<TRecord, TUpdate>,
  ): Promise<UpdateManyResult>;
  deleteOne<TSelection extends AnySelectBuilder<TRecord>>(
    options: DeleteOneOptions<TRecord> & {
      readonly select: (select: SelectBuilder<TRecord>) => TSelection;
    },
  ): Promise<DeleteOneResult<SelectedBuilderRecord<TRecord, TSelection>>>;
  deleteOne(
    options: DeleteOneOptions<TRecord> & { readonly select: SelectAst },
  ): Promise<DeleteOneResult<TRecord>>;
  deleteOne(options: DeleteOneOptions<TRecord>): Promise<DeleteOneResult>;
  deleteMany(options: DeleteManyOptions<TRecord>): Promise<DeleteManyResult>;
}
