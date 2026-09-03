import type { RepositoryErrorCode } from './errors.js';

export type RepositoryRecord = Record<string, unknown>;

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

export type RepositoryFilter<TRecord extends object> =
  FilterAst | ((filter: FilterBuilder<TRecord>) => FilterNode);

export interface SelectNode {
  readonly kind: 'selection';
  readonly fields?: readonly string[];
  readonly relations?: readonly SelectRelationNode[];
}

export interface SelectRelationNode {
  readonly kind: 'relation';
  readonly field: string;
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

export type SortDirection = 'asc' | 'desc';

export type SortNullsPosition = 'first' | 'last';

export interface SortFieldTarget {
  readonly kind: 'field';
  readonly field: string;
}

export interface SortRelationFieldTarget {
  readonly kind: 'relationField';
  readonly relation: RepositoryPath;
  readonly field: string;
}

export interface SortRelationCountTarget {
  readonly kind: 'relationAggregate';
  readonly relation: RepositoryPath;
  readonly aggregate: 'count';
  readonly field?: never;
}

export interface SortRelationValueAggregateTarget {
  readonly kind: 'relationAggregate';
  readonly relation: RepositoryPath;
  readonly aggregate: 'sum' | 'avg' | 'min' | 'max';
  readonly field: string;
}

export type SortTarget =
  | SortFieldTarget
  | SortRelationFieldTarget
  | SortRelationCountTarget
  | SortRelationValueAggregateTarget;

export interface SortItemNode {
  readonly by: SortTarget;
  readonly direction: SortDirection;
  readonly nulls?: SortNullsPosition;
}

export interface SortAst {
  readonly kind: 'sort';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly SortItemNode[];
}

export interface NonEmptySortAst extends SortAst {
  readonly items: readonly [SortItemNode, ...SortItemNode[]];
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
  RelationSetNode | RelationClearNode | RelationPatchNode | RelationReplaceNode;

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

export interface RelationMutationBuilder {
  set(
    field: string,
    target: (
      builder: RelationTargetMutationBuilder,
    ) => RelationTargetMutationBuilder,
  ): this;
  clear(field: string): this;
  patch(
    field: string,
    targets: (
      builder: RelationPatchMutationBuilder,
    ) => RelationPatchMutationBuilder,
  ): this;
  replace(
    field: string,
    targets: (
      builder: RelationReplaceMutationBuilder,
    ) => RelationReplaceMutationBuilder,
  ): this;
  toAst(): RelationMutationAst;
}

export interface NestedCreateOptions {
  readonly clientKey?: string;
  readonly relations?: RelationMutationInput;
}

export interface RelationTargetMutationBuilder {
  connect(values: Readonly<Record<string, unknown>>): this;
  connectBy(
    fields: readonly string[],
    values: Readonly<Record<string, unknown>>,
  ): this;
  create(
    values: Readonly<Record<string, unknown>>,
    options?: NestedCreateOptions,
  ): this;
}

export interface RelationPatchMutationBuilder extends RelationTargetMutationBuilder {
  disconnect(values: Readonly<Record<string, unknown>>): this;
  disconnectBy(
    fields: readonly string[],
    values: Readonly<Record<string, unknown>>,
  ): this;
}

export type RelationReplaceMutationBuilder = RelationTargetMutationBuilder;

export type RelationMutationInput =
  | RelationMutationAst
  | ((relations: RelationMutationBuilder) => RelationMutationBuilder);

export interface RepositoryReadOptions {
  readonly select?: SelectAst;
  readonly context?: RepositoryContext;
}

export interface FindManyOptions<
  TRecord extends object,
> extends RepositoryReadOptions {
  readonly filter?: RepositoryFilter<TRecord>;
  readonly sort?: SortAst;
  readonly limit?: number;
  readonly offset?: number;
}

export type FindOneOptions<TRecord extends object> = RepositoryReadOptions &
  (
    | {
        readonly filter: RepositoryFilter<TRecord>;
        readonly sort?: SortAst;
      }
    | {
        readonly filter?: RepositoryFilter<TRecord>;
        readonly sort: NonEmptySortAst;
      }
  );

export interface FilterOnlyOptions<TRecord extends object> {
  readonly filter?: RepositoryFilter<TRecord>;
  readonly context?: RepositoryContext;
}

export interface CreateOneOptions<TCreate extends object> {
  readonly values: TCreate;
  readonly relations?: RelationMutationInput;
  readonly select?: SelectAst;
}

export interface CreateManyOptions<TCreate extends object> {
  readonly records: readonly [TCreate, ...TCreate[]];
}

export type UpdateOneOptions<TUpdate extends object> = {
  readonly unique: UniqueSelector;
  readonly select?: SelectAst;
  readonly ifVersion?: string | number;
} & (
  | {
      readonly values: TUpdate;
      readonly relations?: RelationMutationInput;
    }
  | {
      readonly values?: TUpdate;
      readonly relations: RelationMutationInput;
    }
);

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

export interface DeleteOneOptions {
  readonly unique: UniqueSelector;
  readonly ifVersion?: string | number;
}

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

export interface DeleteOneResult {
  readonly deleted: true;
}

export interface DeleteManyResult {
  readonly deletedCount: number;
}

export interface DescribeMutationOptions {
  readonly operation: 'createOne' | 'updateOne';
}

export type ValidateMutationOptions<
  TCreate extends object,
  TUpdate extends object,
> =
  | {
      readonly operation: 'createOne';
      readonly values: TCreate;
      readonly relations?: RelationMutationAst;
    }
  | ({
      readonly operation: 'updateOne';
      readonly unique: UniqueSelector;
      readonly ifVersion?: string | number;
    } & (
      | {
          readonly values: TUpdate;
          readonly relations?: RelationMutationAst;
        }
      | {
          readonly values?: TUpdate;
          readonly relations: RelationMutationAst;
        }
    ));

export interface RepositoryUniqueFieldSetDescription {
  readonly fields: readonly string[];
  readonly primary: boolean;
}

export interface RepositoryRelationMutationDescription {
  readonly field: string;
  readonly cardinality: 'one' | 'many';
  readonly targetCollection: string;
  readonly allowedActions: readonly ('set' | 'clear' | 'patch' | 'replace')[];
  readonly patchOperations?: readonly ('connect' | 'create' | 'disconnect')[];
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
  findMany(options?: FindManyOptions<TRecord>): Promise<TRecord[]>;
  findOne(options: FindOneOptions<TRecord>): Promise<TRecord | undefined>;
  count(options?: FilterOnlyOptions<TRecord>): Promise<number>;
  exists(options?: FilterOnlyOptions<TRecord>): Promise<boolean>;
  describeMutation(
    options: DescribeMutationOptions,
  ): Promise<RepositoryMutationDescription>;
  validateMutation(
    options: ValidateMutationOptions<TCreate, TUpdate>,
  ): Promise<MutationValidationResult>;
  createOne(
    options: CreateOneOptions<TCreate>,
  ): Promise<SingleMutationResult<TRecord>>;
  createMany(options: CreateManyOptions<TCreate>): Promise<CreateManyResult>;
  updateOne(
    options: UpdateOneOptions<TUpdate>,
  ): Promise<SingleMutationResult<TRecord>>;
  updateMany(
    options: UpdateManyOptions<TRecord, TUpdate>,
  ): Promise<UpdateManyResult>;
  deleteOne(options: DeleteOneOptions): Promise<DeleteOneResult>;
  deleteMany(options: DeleteManyOptions<TRecord>): Promise<DeleteManyResult>;
}
