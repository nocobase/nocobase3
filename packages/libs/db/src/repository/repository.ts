import type {
  AnyFieldDefinition,
  CollectionDefinition,
  ConstraintDefinition,
  FieldDefinition,
  RelationFieldDefinition,
} from '../collection/types.js';
import type { ConnectionCollections } from '../collection/registry/types.js';
import { RepositoryError } from './errors.js';
import { DefaultFilterBuilder, getFilterFieldGroup } from './filter-builder.js';
import type { RepositoryExecutionAdapter } from './internal/execution-adapter.js';
import type {
  CreateManyOptions,
  CreateManyResult,
  CreateOneOptions,
  DeleteManyOptions,
  DeleteManyResult,
  DeleteOneOptions,
  DeleteOneResult,
  DescribeMutationOptions,
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterNode,
  FilterOnlyOptions,
  FilterOperator,
  FilterValue,
  FilterVariable,
  FindManyOptions,
  FindOneOptions,
  MutationValidationError,
  MutationValidationResult,
  Repository,
  RepositoryFilter,
  RepositoryMutationDescription,
  RepositoryRecord,
  SelectAst,
  SelectRelationNode,
  SingleMutationResult,
  SortAst,
  UniqueSelector,
  UpdateManyOptions,
  UpdateManyResult,
  UpdateOneOptions,
  ValidateMutationOptions,
} from './types.js';

export interface DefaultRepositoryOptions {
  readonly collection: string;
  readonly collections: Pick<ConnectionCollections, 'get'>;
  readonly adapter: RepositoryExecutionAdapter;
}

export class DefaultRepository<
  TRecord extends object = RepositoryRecord,
  TCreate extends object = Partial<TRecord>,
  TUpdate extends object = Partial<TRecord>,
> implements Repository<TRecord, TCreate, TUpdate> {
  constructor(private readonly options: DefaultRepositoryOptions) {}

  async findMany(options: FindManyOptions<TRecord> = {}): Promise<TRecord[]> {
    const collection = await this.collection();
    const selection = await this.validateSelect(
      collection,
      options.select,
      options.context,
    );
    const filter = await this.normalizeFilter(
      collection,
      options.filter,
      options.context,
    );
    const sort = await this.validateSort(collection, options.sort);
    validatePagination(options.limit, options.offset, sort);
    return (await this.options.adapter.findMany({
      collection,
      fields: selection.fields,
      select: selection.select,
      filter,
      sort,
      limit: options.limit,
      offset: options.offset,
    })) as TRecord[];
  }

  async findOne(
    options: FindOneOptions<TRecord>,
  ): Promise<TRecord | undefined> {
    const collection = await this.collection();
    const selection = await this.validateSelect(
      collection,
      options.select,
      options.context,
    );
    const filter = await this.normalizeFilter(
      collection,
      options.filter,
      options.context,
    );
    const sort = await this.validateSort(collection, options.sort);
    if (!filter && (!options.sort || options.sort.items.length === 0)) {
      invalid(
        'INVALID_FILTER',
        'findOne() requires filter or non-empty sort.',
        {
          collection: collection.name,
        },
      );
    }
    return (await this.options.adapter.findOne({
      collection,
      fields: selection.fields,
      select: selection.select,
      filter,
      sort,
      limit: 1,
    })) as TRecord | undefined;
  }

  async count(options: FilterOnlyOptions<TRecord> = {}): Promise<number> {
    const collection = await this.collection();
    return this.options.adapter.count({
      collection,
      filter: await this.normalizeFilter(
        collection,
        options.filter,
        options.context,
      ),
    });
  }

  async exists(options: FilterOnlyOptions<TRecord> = {}): Promise<boolean> {
    const collection = await this.collection();
    return this.options.adapter.exists({
      collection,
      filter: await this.normalizeFilter(
        collection,
        options.filter,
        options.context,
      ),
    });
  }

  async describeMutation(
    options: DescribeMutationOptions,
  ): Promise<RepositoryMutationDescription> {
    const collection = await this.collection();
    return {
      collection: collection.name!,
      operation: options.operation,
      relations: relationFields(collection).map((relation) => ({
        field: relation.name,
        cardinality:
          relation.type === 'belongsTo' || relation.type === 'hasOne'
            ? 'one'
            : 'many',
        targetCollection: relation.target,
        allowedActions: [],
        uniqueFieldSets: [],
      })),
      limits: { maxDepth: 3, maxNodes: 100 },
    };
  }

  async validateMutation(
    options: ValidateMutationOptions<TCreate, TUpdate>,
  ): Promise<MutationValidationResult> {
    try {
      const collection = await this.collection();
      assertWritableCollection(collection);
      validateValues(collection, options.values, options.operation);
      if (options.operation === 'updateOne') {
        validateUnique(collection, options.unique);
        validateIfVersion(collection, options.ifVersion);
      }
      if (options.relations) relationNotSupported(collection);
      return { valid: true, errors: [] };
    } catch (error) {
      if (!(error instanceof RepositoryError)) throw error;
      return { valid: false, errors: [toValidationError(error)] };
    }
  }

  async createOne(
    options: CreateOneOptions<TCreate>,
  ): Promise<SingleMutationResult<TRecord>> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    if (options.relations) relationNotSupported(collection);
    const values = validateValues(collection, options.values, 'createOne');
    const selection = await this.validateSelect(collection, options.select);
    if (selection.select?.root.relations?.length) {
      relationNotSupported(collection, ['select', 'root', 'relations']);
    }
    const requestedFields = selection.fields;
    const executionFields = includeExecutionFields(collection, requestedFields);
    const result = await this.options.adapter.createOne({
      collection,
      fields: executionFields,
      values,
    });
    return {
      record: pick(result.record, requestedFields) as TRecord,
      createdTargets: [],
      version: result.version,
    };
  }

  async createMany(
    options: CreateManyOptions<TCreate>,
  ): Promise<CreateManyResult> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    if (options.records.length === 0) {
      invalid('INVALID_MUTATION', 'createMany() records must not be empty.', {
        collection: collection.name,
        path: ['records'],
      });
    }
    const records = options.records.map((record) =>
      validateValues(collection, record, 'createMany'),
    );
    return {
      createdCount: await this.options.adapter.createMany({
        collection,
        records,
      }),
    };
  }

  async updateOne(
    options: UpdateOneOptions<TUpdate>,
  ): Promise<SingleMutationResult<TRecord>> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    if (options.relations) relationNotSupported(collection);
    const unique = validateUnique(collection, options.unique);
    validateIfVersion(collection, options.ifVersion);
    const values = validateValues(collection, options.values, 'updateOne');
    const selection = await this.validateSelect(collection, options.select);
    if (selection.select?.root.relations?.length) {
      relationNotSupported(collection, ['select', 'root', 'relations']);
    }
    const requestedFields = selection.fields;
    const result = await this.options.adapter.updateOne({
      collection,
      fields: includeExecutionFields(collection, requestedFields),
      unique,
      values,
      ifVersion: options.ifVersion,
    });
    if (!result) {
      await this.throwUpdateMiss(collection, unique, options.ifVersion);
    }
    return {
      record: pick(result!.record, requestedFields) as TRecord,
      createdTargets: [],
      version: result!.version,
    };
  }

  async updateMany(
    options: UpdateManyOptions<TRecord, TUpdate>,
  ): Promise<UpdateManyResult> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    const filter = await this.normalizeMutationFilter(
      collection,
      options.filter,
      options.context,
      options.all === true,
    );
    const values = validateValues(collection, options.values, 'updateMany');
    return {
      updatedCount: await this.options.adapter.updateMany({
        collection,
        filter,
        all: options.all === true,
        values,
      }),
    };
  }

  async deleteOne(options: DeleteOneOptions): Promise<DeleteOneResult> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    const unique = validateUnique(collection, options.unique);
    validateIfVersion(collection, options.ifVersion);
    const result = await this.options.adapter.deleteOne({
      collection,
      unique,
      ifVersion: options.ifVersion,
    });
    if (result === 'conflict') versionConflict(collection);
    if (result === 'missing') recordNotFound(collection);
    return { deleted: true };
  }

  async deleteMany(
    options: DeleteManyOptions<TRecord>,
  ): Promise<DeleteManyResult> {
    const collection = await this.collection();
    assertWritableCollection(collection);
    const filter = await this.normalizeMutationFilter(
      collection,
      options.filter,
      options.context,
      options.all === true,
    );
    return {
      deletedCount: await this.options.adapter.deleteMany({
        collection,
        filter,
        all: options.all === true,
      }),
    };
  }

  private async collection(): Promise<CollectionDefinition> {
    const collection = await this.options.collections.get(
      this.options.collection,
    );
    if (!collection) {
      invalid(
        'COLLECTION_NOT_FOUND',
        `Collection "${this.options.collection}" does not exist.`,
        { collection: this.options.collection },
      );
    }
    return collection;
  }

  private async normalizeFilter<T extends object>(
    collection: CollectionDefinition,
    input: RepositoryFilter<T> | undefined,
    context: Readonly<Record<string, unknown>> | undefined,
  ): Promise<FilterAst | undefined> {
    return normalizeFilterWithRelations(
      this.options.collections,
      collection,
      input,
      context,
    );
  }

  private async validateSelect(
    collection: CollectionDefinition,
    select: SelectAst | undefined,
    context?: Readonly<Record<string, unknown>>,
  ): Promise<ValidatedSelect> {
    return validateSelectWithRelations(
      this.options.collections,
      collection,
      select,
      context,
    );
  }

  private async validateSort(
    collection: CollectionDefinition,
    sort: SortAst | undefined,
  ): Promise<SortAst | undefined> {
    return validateSortWithRelations(
      this.options.collections,
      collection,
      sort,
    );
  }

  private async normalizeMutationFilter<T extends object>(
    collection: CollectionDefinition,
    filter: RepositoryFilter<T> | undefined,
    context: Readonly<Record<string, unknown>> | undefined,
    all: boolean,
  ): Promise<FilterAst | undefined> {
    if (all) {
      if (filter !== undefined) {
        invalid('INVALID_FILTER', 'filter and all are mutually exclusive.', {
          collection: collection.name,
        });
      }
      return undefined;
    }
    const normalized = await this.normalizeFilter(collection, filter, context);
    if (!normalized || normalized.root.items.length === 0) {
      invalid(
        'INVALID_FILTER',
        'Bulk mutations require a non-empty filter or all: true.',
        { collection: collection.name, path: ['filter'] },
      );
    }
    return normalized;
  }

  private async throwUpdateMiss(
    collection: CollectionDefinition,
    unique: UniqueSelector,
    ifVersion: string | number | undefined,
  ): Promise<never> {
    if (ifVersion !== undefined) {
      const exists = await this.options.adapter.exists({
        collection,
        filter: uniqueFilter(unique),
      });
      if (exists) versionConflict(collection);
    }
    return recordNotFound(collection);
  }
}

const OPERATORS_BY_TYPE: Readonly<Record<string, readonly FilterOperator[]>> = {
  string: ['$includes', '$notIncludes', '$eq', '$ne', '$empty', '$notEmpty'],
  uuid: ['$includes', '$notIncludes', '$eq', '$ne', '$empty', '$notEmpty'],
  text: ['$includes', '$notIncludes', '$eq', '$ne', '$empty', '$notEmpty'],
  increments: [
    '$eq',
    '$ne',
    '$gt',
    '$gte',
    '$lt',
    '$lte',
    '$empty',
    '$notEmpty',
  ],
  integer: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'],
  bigInt: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'],
  decimal: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'],
  float: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'],
  double: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'],
  date: [
    '$dateOn',
    '$dateNotOn',
    '$dateBefore',
    '$dateAfter',
    '$dateNotBefore',
    '$dateNotAfter',
    '$dateBetween',
    '$empty',
    '$notEmpty',
  ],
  datetime: [
    '$dateBefore',
    '$dateAfter',
    '$dateNotBefore',
    '$dateNotAfter',
    '$dateBetween',
    '$empty',
    '$notEmpty',
  ],
  time: ['$eq', '$ne', '$empty', '$notEmpty'],
  boolean: ['$isTruly', '$isFalsy', '$empty', '$notEmpty'],
};

const FILTER_GROUP_BY_TYPE: Readonly<Record<string, string>> = {
  string: 'string',
  uuid: 'string',
  text: 'text',
  increments: 'number',
  integer: 'number',
  bigInt: 'number',
  decimal: 'number',
  float: 'number',
  double: 'number',
  date: 'date',
  datetime: 'date',
  time: 'time',
  boolean: 'boolean',
  json: 'json',
};

const SORTABLE_TYPES = new Set([
  'increments',
  'integer',
  'bigInt',
  'decimal',
  'float',
  'double',
  'string',
  'uuid',
  'boolean',
  'date',
  'datetime',
  'time',
]);

function normalizeScalarFilter<TRecord extends object>(
  collection: CollectionDefinition,
  input: RepositoryFilter<TRecord> | undefined,
  context: Readonly<Record<string, unknown>> | undefined,
): FilterAst | undefined {
  if (!input) return undefined;
  const ast =
    typeof input === 'function'
      ? wrapFilter(input(new DefaultFilterBuilder<TRecord>()), collection.name!)
      : input;
  if (
    ast.kind !== 'filter' ||
    ast.version !== 1 ||
    ast.root?.kind !== 'group'
  ) {
    invalid('INVALID_FILTER', 'Expected a Repository Filter AST version 1.', {
      collection: collection.name,
    });
  }
  if (ast.collection !== undefined && ast.collection !== collection.name) {
    invalid(
      'INVALID_FILTER',
      `Filter Collection "${ast.collection}" does not match "${collection.name}".`,
      { collection: collection.name, path: ['collection'] },
    );
  }
  const root = validateFilterGroup(collection, ast.root, context, ['root']);
  return { kind: 'filter', version: 1, collection: collection.name, root };
}

function wrapFilter(node: FilterNode, collection: string): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    collection,
    root:
      node.kind === 'group'
        ? node
        : { kind: 'group', logic: 'and', items: [node] },
  };
}

function validateFilterGroup(
  collection: CollectionDefinition,
  group: FilterGroupNode,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
): FilterGroupNode {
  if (group.logic !== 'and' && group.logic !== 'or') {
    invalid('INVALID_FILTER', 'Filter group logic must be and or or.', {
      collection: collection.name,
      path: [...path, 'logic'],
    });
  }
  return {
    kind: 'group',
    logic: group.logic,
    items: group.items.map((node, index) =>
      validateFilterNode(collection, node, context, [...path, 'items', index]),
    ),
  };
}

function validateFilterNode(
  collection: CollectionDefinition,
  node: FilterNode,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
): FilterNode {
  if (node.kind === 'group') {
    return validateFilterGroup(collection, node, context, path);
  }
  if (node.kind === 'relation' || node.path.length !== 1) return node;
  const field = scalarField(collection, node.path[0], [...path, 'path', 0]);
  const builderGroup = getFilterFieldGroup(node);
  if (
    builderGroup !== undefined &&
    builderGroup !== FILTER_GROUP_BY_TYPE[field.type]
  ) {
    invalid(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `Filter group "${builderGroup}" does not match Field "${field.name}" of type "${field.type}".`,
      { collection: collection.name, field: field.name, path },
    );
  }
  if (!OPERATORS_BY_TYPE[field.type]?.includes(node.operator)) {
    invalid(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `Operator "${node.operator}" is not supported for Field "${field.name}" of type "${field.type}".`,
      {
        collection: collection.name,
        field: field.name,
        path: [...path, 'operator'],
      },
    );
  }
  validateConditionValue(field, node, path);
  const value = resolveFilterValue(node.value, context, [...path, 'value']);
  validateResolvedConditionValue(field, node.operator, value, path);
  return {
    ...node,
    value,
  };
}

function validateResolvedConditionValue(
  field: FieldDefinition,
  operator: FilterOperator,
  value: FilterValue | undefined,
  path: readonly (string | number)[],
): void {
  if (['$empty', '$notEmpty', '$isTruly', '$isFalsy'].includes(operator)) {
    return;
  }
  if (operator === '$dateBetween') {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value.some((item) => !validDateLiteral(field.type, item))
    ) {
      invalid('INVALID_FILTER', '$dateBetween requires two valid ISO values.', {
        field: field.name,
        path: [...path, 'value'],
      });
    }
    return;
  }
  const valid = (() => {
    switch (field.type) {
      case 'string':
      case 'uuid':
      case 'text':
      case 'time':
        return (
          typeof value === 'string' ||
          (value === null && ['$eq', '$ne'].includes(operator))
        );
      case 'increments':
      case 'integer':
      case 'bigInt':
      case 'decimal':
      case 'float':
      case 'double':
        return (
          (typeof value === 'number' && Number.isFinite(value)) ||
          (value === null && ['$eq', '$ne'].includes(operator))
        );
      case 'date':
      case 'datetime':
        return validDateLiteral(field.type, value);
      default:
        return false;
    }
  })();
  if (!valid) {
    invalid(
      'INVALID_FILTER',
      `Filter value is invalid for Field "${field.name}" of type "${field.type}".`,
      { field: field.name, path: [...path, 'value'] },
    );
  }
}

function validDateLiteral(type: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return type === 'date'
    ? /^\d{4}-\d{2}-\d{2}$/u.test(value)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
        value,
      );
}

function validateConditionValue(
  field: FieldDefinition,
  node: FilterConditionNode,
  path: readonly (string | number)[],
): void {
  const noValue = ['$empty', '$notEmpty', '$isTruly', '$isFalsy'].includes(
    node.operator,
  );
  if (noValue ? node.value !== undefined : node.value === undefined) {
    invalid(
      'INVALID_FILTER',
      noValue
        ? `Operator "${node.operator}" does not accept a value.`
        : `Operator "${node.operator}" requires a value.`,
      { field: field.name, path: [...path, 'value'] },
    );
  }
  if (
    (node.operator === '$dateOn' || node.operator === '$dateNotOn') &&
    field.type === 'datetime'
  ) {
    invalid(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `${node.operator} is only available for date Fields.`,
      { field: field.name, path: [...path, 'operator'] },
    );
  }
}

function resolveFilterValue(
  value: FilterValue | undefined,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
): FilterValue | undefined {
  if (isVariable(value)) {
    return resolveVariable(value, context, path) as FilterValue;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      isVariable(item)
        ? resolveVariable(item, context, [...path, index])
        : item,
    ) as FilterValue;
  }
  return value;
}

function isVariable(value: unknown): value is FilterVariable {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === 'variable'
  );
}

function resolveVariable(
  variable: FilterVariable,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
): unknown {
  if (!variable.path.startsWith('$') || variable.path.length === 1) {
    invalid('INVALID_CONTEXT', 'Variable paths must start with $.', { path });
  }
  let current: unknown = context;
  for (const segment of variable.path.slice(1).split('.')) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.hasOwn(current, segment)
    ) {
      invalid(
        'VARIABLE_NOT_FOUND',
        `Filter variable "${variable.path}" could not be resolved.`,
        { path, details: { variable: variable.path } },
      );
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function validateScalarSelect(
  collection: CollectionDefinition,
  select: SelectAst | undefined,
): string[] {
  if (!select) return scalarFields(collection).map((field) => field.name);
  if (
    select.kind !== 'select' ||
    select.version !== 1 ||
    select.root?.kind !== 'selection'
  ) {
    invalid('INVALID_SELECT', 'Expected a Repository Select AST version 1.', {
      collection: collection.name,
    });
  }
  if (
    select.collection !== undefined &&
    select.collection !== collection.name
  ) {
    invalid('INVALID_SELECT', 'Select Collection does not match Repository.', {
      collection: collection.name,
      path: ['collection'],
    });
  }
  const fields =
    select.root.fields ?? scalarFields(collection).map((field) => field.name);
  const seen = new Set<string>();
  for (const [index, field] of fields.entries()) {
    scalarField(collection, field, ['root', 'fields', index]);
    if (seen.has(field)) {
      invalid(
        'INVALID_SELECT',
        `Field "${field}" is selected more than once.`,
        {
          collection: collection.name,
          field,
          path: ['root', 'fields', index],
        },
      );
    }
    seen.add(field);
  }
  return [...fields];
}

function validateScalarSort(
  collection: CollectionDefinition,
  sort: SortAst | undefined,
): SortAst | undefined {
  if (!sort) return undefined;
  if (
    sort.kind !== 'sort' ||
    sort.version !== 1 ||
    !Array.isArray(sort.items)
  ) {
    invalid('INVALID_SORT', 'Expected a Repository Sort AST version 1.', {
      collection: collection.name,
    });
  }
  if (sort.collection !== undefined && sort.collection !== collection.name) {
    invalid('INVALID_SORT', 'Sort Collection does not match Repository.', {
      collection: collection.name,
      path: ['collection'],
    });
  }
  sort.items.forEach((item, index) => {
    if (item.by.kind !== 'field') {
      relationNotSupported(collection, ['items', index, 'by']);
    }
    const field = scalarField(collection, item.by.field, [
      'items',
      index,
      'by',
      'field',
    ]);
    if (!SORTABLE_TYPES.has(field.type)) {
      invalid(
        'FIELD_CAPABILITY_NOT_SUPPORTED',
        `Field "${field.name}" of type "${field.type}" is not sortable.`,
        {
          collection: collection.name,
          field: field.name,
          path: ['items', index, 'by'],
        },
      );
    }
    if (item.direction !== 'asc' && item.direction !== 'desc') {
      invalid('INVALID_SORT', 'Sort direction must be asc or desc.', {
        collection: collection.name,
        path: ['items', index, 'direction'],
      });
    }
    if (
      item.nulls !== undefined &&
      item.nulls !== 'first' &&
      item.nulls !== 'last'
    ) {
      invalid('INVALID_SORT', 'Sort nulls must be first or last.', {
        collection: collection.name,
        path: ['items', index, 'nulls'],
      });
    }
  });
  return { ...sort, collection: collection.name };
}

async function normalizeFilterWithRelations<TRecord extends object>(
  collections: Pick<ConnectionCollections, 'get'>,
  collection: CollectionDefinition,
  input: RepositoryFilter<TRecord> | undefined,
  context: Readonly<Record<string, unknown>> | undefined,
): Promise<FilterAst | undefined> {
  const normalized = normalizeScalarFilter(collection, input, context);
  if (!normalized) return undefined;
  return {
    ...normalized,
    root: await normalizeRelationFilterGroup(
      collections,
      collection,
      normalized.root,
      context,
      ['root'],
    ),
  };
}

async function normalizeRelationFilterGroup(
  collections: Pick<ConnectionCollections, 'get'>,
  collection: CollectionDefinition,
  group: FilterGroupNode,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
  inheritedBuilderGroup?: string,
): Promise<FilterGroupNode> {
  return {
    ...group,
    items: await Promise.all(
      group.items.map((node, index) =>
        normalizeRelationFilterNode(
          collections,
          collection,
          node,
          context,
          [...path, 'items', index],
          inheritedBuilderGroup,
        ),
      ),
    ),
  };
}

async function normalizeRelationFilterNode(
  collections: Pick<ConnectionCollections, 'get'>,
  collection: CollectionDefinition,
  node: FilterNode,
  context: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
  inheritedBuilderGroup?: string,
): Promise<FilterNode> {
  if (node.kind === 'group') {
    return normalizeRelationFilterGroup(
      collections,
      collection,
      node,
      context,
      path,
      inheritedBuilderGroup,
    );
  }
  if (node.kind === 'condition') {
    const builderGroup = inheritedBuilderGroup ?? getFilterFieldGroup(node);
    if (node.path.length === 1) {
      const field = scalarField(collection, node.path[0], [...path, 'path', 0]);
      if (
        builderGroup !== undefined &&
        builderGroup !== FILTER_GROUP_BY_TYPE[field.type]
      ) {
        invalid(
          'FIELD_CAPABILITY_NOT_SUPPORTED',
          `Filter group "${builderGroup}" does not match Field "${field.name}" of type "${field.type}".`,
          { collection: collection.name, field: field.name, path },
        );
      }
      return validateFilterNode(collection, node, context, path);
    }
    const [relationName, ...rest] = node.path;
    const relation = relationField(collection, relationName, [
      ...path,
      'path',
      0,
    ]);
    if (relation.type !== 'belongsTo' && relation.type !== 'hasOne') {
      invalid(
        'INVALID_FILTER',
        'Direct relation paths may traverse to-one relations only.',
        {
          collection: collection.name,
          relation: relation.name,
          path: [...path, 'path'],
        },
      );
    }
    const target = await targetCollection(collections, relation, path);
    const nestedInput: FilterConditionNode = { ...node, path: rest };
    const nested = await normalizeRelationFilterNode(
      collections,
      target,
      nestedInput,
      context,
      path,
      builderGroup,
    );
    return {
      kind: 'relation',
      path: [relation.name],
      quantifier: 'exists',
      filter: asGroup(nested),
    };
  }
  if (node.path.length !== 1) {
    invalid(
      'INVALID_FILTER',
      'Relation quantifier path must name one relation.',
      {
        collection: collection.name,
        path: [...path, 'path'],
      },
    );
  }
  const relation = relationField(collection, node.path[0], [
    ...path,
    'path',
    0,
  ]);
  const target = await targetCollection(collections, relation, path);
  if (
    (node.quantifier === 'some' || node.quantifier === 'none') &&
    !node.filter
  ) {
    invalid('INVALID_FILTER', `${node.quantifier} requires a nested filter.`, {
      collection: collection.name,
      relation: relation.name,
      path: [...path, 'filter'],
    });
  }
  if (node.quantifier !== 'some' && node.quantifier !== 'none' && node.filter) {
    invalid('INVALID_FILTER', `${node.quantifier} does not accept a filter.`, {
      collection: collection.name,
      relation: relation.name,
      path: [...path, 'filter'],
    });
  }
  return {
    ...node,
    filter: node.filter
      ? await normalizeRelationFilterGroup(
          collections,
          target,
          validateFilterGroup(target, node.filter, context, [
            ...path,
            'filter',
          ]),
          context,
          [...path, 'filter'],
        )
      : undefined,
  };
}

async function validateSelectWithRelations(
  collections: Pick<ConnectionCollections, 'get'>,
  collection: CollectionDefinition,
  select: SelectAst | undefined,
  context: Readonly<Record<string, unknown>> | undefined,
): Promise<ValidatedSelect> {
  const fields = validateScalarSelect(collection, select);
  const seen = new Set<string>();
  const relations: SelectRelationNode[] = [];
  for (const [index, node] of (select?.root.relations ?? []).entries()) {
    const path = ['root', 'relations', index] as const;
    if (node.kind !== 'relation') {
      invalid('INVALID_SELECT', 'Expected a relation selection node.', {
        collection: collection.name,
        path,
      });
    }
    if (seen.has(node.field)) {
      invalid(
        'INVALID_SELECT',
        `Relation "${node.field}" is selected more than once.`,
        {
          collection: collection.name,
          relation: node.field,
          path,
        },
      );
    }
    seen.add(node.field);
    const relation = relationField(collection, node.field, [...path, 'field']);
    const target = await targetCollection(collections, relation, path);
    const nested = await validateSelectWithRelations(
      collections,
      target,
      {
        kind: 'select',
        version: 1,
        root: node.select,
      },
      context,
    );
    const filter = await normalizeFilterWithRelations(
      collections,
      target,
      node.filter,
      context,
    );
    if (
      node.sort?.items.length &&
      (relation.type === 'belongsTo' || relation.type === 'hasOne')
    ) {
      invalid(
        'INVALID_SORT',
        'Relation-local sort is only available for to-many relations.',
        {
          collection: collection.name,
          relation: relation.name,
          path: [...path, 'sort'],
        },
      );
    }
    const sort = isToManyRelation(relation)
      ? await validateSortWithRelations(collections, target, node.sort)
      : undefined;
    relations.push({
      ...node,
      select: nested.select?.root ?? { ...node.select, fields: nested.fields },
      filter,
      sort,
    });
  }
  return {
    fields,
    select: select
      ? {
          ...select,
          collection: collection.name,
          root: { ...select.root, fields, relations },
        }
      : undefined,
  };
}

interface ValidatedSelect {
  readonly fields: string[];
  readonly select?: SelectAst;
}

async function validateSortWithRelations(
  collections: Pick<ConnectionCollections, 'get'>,
  collection: CollectionDefinition,
  sort: SortAst | undefined,
): Promise<SortAst | undefined> {
  if (!sort) {
    const fields = primaryFields(collection);
    return fields.length
      ? {
          kind: 'sort',
          version: 1,
          collection: collection.name,
          items: fields.map((field) => ({
            by: { kind: 'field', field },
            direction: 'asc',
          })),
        }
      : undefined;
  }
  const directItems = sort.items.filter((item) => item.by.kind === 'field');
  validateScalarSort(collection, { ...sort, items: directItems });
  const seen = new Set<string>();
  for (const [index, item] of sort.items.entries()) {
    if (item.direction !== 'asc' && item.direction !== 'desc') {
      invalid('INVALID_SORT', 'Sort direction must be asc or desc.', {
        collection: collection.name,
        path: ['items', index, 'direction'],
      });
    }
    if (
      item.nulls !== undefined &&
      item.nulls !== 'first' &&
      item.nulls !== 'last'
    ) {
      invalid('INVALID_SORT', 'Sort nulls must be first or last.', {
        collection: collection.name,
        path: ['items', index, 'nulls'],
      });
    }
    const identity = JSON.stringify(item.by);
    if (seen.has(identity)) {
      invalid('INVALID_SORT', 'Sort targets must not be repeated.', {
        collection: collection.name,
        path: ['items', index, 'by'],
      });
    }
    seen.add(identity);
    if (item.by.kind === 'field') continue;
    let current = collection;
    let terminal: RelationFieldDefinition | undefined;
    for (const [relationIndex, name] of item.by.relation.entries()) {
      terminal = relationField(current, name, [
        'items',
        index,
        'by',
        'relation',
        relationIndex,
      ]);
      if (
        item.by.kind === 'relationAggregate' &&
        relationIndex < item.by.relation.length - 1 &&
        terminal.type !== 'belongsTo' &&
        terminal.type !== 'hasOne'
      ) {
        invalid(
          'INVALID_SORT',
          'relationAggregate may traverse to-one relations before one terminal to-many relation.',
          {
            collection: current.name,
            relation: terminal.name,
            path: ['items', index, 'by', 'relation', relationIndex],
          },
        );
      }
      if (
        item.by.kind === 'relationField' &&
        terminal.type !== 'belongsTo' &&
        terminal.type !== 'hasOne'
      ) {
        invalid(
          'INVALID_SORT',
          'relationField may traverse to-one relations only.',
          {
            collection: current.name,
            relation: terminal.name,
            path: ['items', index, 'by'],
          },
        );
      }
      current = await targetCollection(collections, terminal, ['items', index]);
    }
    if (!terminal) {
      invalid('INVALID_SORT', 'Relation sort path must not be empty.', {
        collection: collection.name,
        path: ['items', index, 'by', 'relation'],
      });
    }
    if (item.by.kind === 'relationField') {
      const field = scalarField(current, item.by.field, [
        'items',
        index,
        'by',
        'field',
      ]);
      if (!SORTABLE_TYPES.has(field.type)) {
        invalid(
          'FIELD_CAPABILITY_NOT_SUPPORTED',
          'Relation Field is not sortable.',
          {
            collection: current.name,
            field: field.name,
            path: ['items', index, 'by', 'field'],
          },
        );
      }
    } else {
      if (terminal.type === 'belongsTo' || terminal.type === 'hasOne') {
        invalid(
          'INVALID_SORT',
          'relationAggregate requires a to-many terminal relation.',
          {
            collection: collection.name,
            relation: terminal.name,
            path: ['items', index, 'by'],
          },
        );
      }
      if (item.by.aggregate !== 'count') {
        const field = scalarField(current, item.by.field, [
          'items',
          index,
          'by',
          'field',
        ]);
        const allowed =
          item.by.aggregate === 'sum' || item.by.aggregate === 'avg'
            ? FILTER_GROUP_BY_TYPE[field.type] === 'number'
            : SORTABLE_TYPES.has(field.type);
        if (!allowed) {
          invalid(
            'FIELD_CAPABILITY_NOT_SUPPORTED',
            `Aggregate "${item.by.aggregate}" is not supported for Field "${field.name}" of type "${field.type}".`,
            {
              collection: current.name,
              field: field.name,
              path: ['items', index, 'by', 'field'],
            },
          );
        }
      }
    }
  }
  const items = [...sort.items];
  const direct = new Set(
    items.flatMap((item) => (item.by.kind === 'field' ? [item.by.field] : [])),
  );
  const alreadyUnique = uniqueConstraints(collection).some((constraint) =>
    constraint.fields.every((field) => direct.has(field)),
  );
  if (!alreadyUnique) {
    for (const field of primaryFields(collection)) {
      if (!direct.has(field)) {
        items.push({ by: { kind: 'field', field }, direction: 'asc' });
      }
    }
  }
  return { ...sort, collection: collection.name, items };
}

function primaryFields(collection: CollectionDefinition): string[] {
  return (
    uniqueConstraints(collection).find(
      (constraint) => constraint.type === 'primary',
    )?.fields ?? []
  );
}

function asGroup(node: FilterNode): FilterGroupNode {
  return node.kind === 'group'
    ? node
    : { kind: 'group', logic: 'and', items: [node] };
}

function relationField(
  collection: CollectionDefinition,
  name: string,
  path: readonly (string | number)[],
): RelationFieldDefinition {
  const field = directField(collection, name, path);
  if (!isRelationField(field)) {
    invalid('RELATION_NOT_FOUND', `Field "${name}" is not a relation.`, {
      collection: collection.name,
      field: name,
      path,
    });
  }
  return field;
}

function isToManyRelation(relation: RelationFieldDefinition): boolean {
  return relation.type === 'hasMany' || relation.type === 'belongsToMany';
}

async function targetCollection(
  collections: Pick<ConnectionCollections, 'get'>,
  relation: RelationFieldDefinition,
  path: readonly (string | number)[],
): Promise<CollectionDefinition> {
  const target = await collections.get(relation.target);
  if (!target) {
    invalid(
      'COLLECTION_NOT_FOUND',
      `Relation target "${relation.target}" does not exist.`,
      {
        collection: relation.target,
        relation: relation.name,
        path,
      },
    );
  }
  return target;
}

function validatePagination(
  limit: number | undefined,
  offset: number | undefined,
  sort: SortAst | undefined,
): void {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    invalid(
      'INVALID_PAGINATION',
      'limit must be a non-negative safe integer.',
      {
        path: ['limit'],
      },
    );
  }
  if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
    invalid(
      'INVALID_PAGINATION',
      'offset must be a non-negative safe integer.',
      {
        path: ['offset'],
      },
    );
  }
  if (offset !== undefined && (!sort || sort.items.length === 0)) {
    invalid('INVALID_PAGINATION', 'offset requires a non-empty Sort AST.', {
      path: ['offset'],
    });
  }
}

function validateValues(
  collection: CollectionDefinition,
  input: object | undefined,
  operation: 'createOne' | 'createMany' | 'updateOne' | 'updateMany',
): RepositoryRecord {
  if (!isPlainRecord(input)) {
    invalid('INVALID_MUTATION', 'values must be a plain object.', {
      collection: collection.name,
      path: ['values'],
    });
  }
  if (
    (operation === 'updateOne' || operation === 'updateMany') &&
    Object.keys(input).length === 0
  ) {
    invalid('INVALID_MUTATION', 'Update values must not be empty.', {
      collection: collection.name,
      path: ['values'],
    });
  }
  for (const key of Object.keys(input)) {
    const field = directField(collection, key, ['values', key]);
    if (!isScalarField(field)) {
      invalid(
        'FIELD_NOT_WRITABLE',
        `Relation Field "${key}" belongs in relations.`,
        {
          collection: collection.name,
          field: key,
          path: ['values', key],
        },
      );
    }
    if (
      field.type === 'increments' ||
      field.autoIncrement ||
      field.db?.generated !== undefined ||
      collection.optimisticLock?.field === field.name
    ) {
      invalid(
        'FIELD_NOT_WRITABLE',
        `Field "${key}" is managed by the database or Repository.`,
        {
          collection: collection.name,
          field: key,
          path: ['values', key],
        },
      );
    }
  }
  return { ...input };
}

function validateUnique(
  collection: CollectionDefinition,
  selector: UniqueSelector,
): UniqueSelector {
  if (
    !selector ||
    selector.kind !== 'unique' ||
    !Array.isArray(selector.fields) ||
    selector.fields.length === 0 ||
    !isPlainRecord(selector.values)
  ) {
    invalid('INVALID_UNIQUE_SELECTOR', 'Expected a logical unique selector.', {
      collection: collection.name,
      path: ['unique'],
    });
  }
  const keys = Object.keys(selector.values);
  if (
    new Set(selector.fields).size !== selector.fields.length ||
    selector.fields.length !== keys.length ||
    selector.fields.some((field) => !Object.hasOwn(selector.values, field)) ||
    selector.fields.some((field) => selector.values[field] === undefined)
  ) {
    invalid(
      'INVALID_UNIQUE_SELECTOR',
      'Unique selector fields and value keys must match exactly.',
      { collection: collection.name, path: ['unique'] },
    );
  }
  selector.fields.forEach((field, index) =>
    scalarField(collection, field, ['unique', 'fields', index]),
  );
  const constraint = uniqueConstraints(collection).find(
    (candidate) =>
      candidate.fields.length === selector.fields.length &&
      candidate.fields.every((field) => selector.fields.includes(field)),
  );
  if (!constraint) {
    invalid(
      'INVALID_UNIQUE_SELECTOR',
      'Selector Field set does not match a primary or unique constraint.',
      { collection: collection.name, path: ['unique', 'fields'] },
    );
  }
  return {
    kind: 'unique',
    fields: constraint.fields,
    values: Object.fromEntries(
      constraint.fields.map((field) => [field, selector.values[field]]),
    ),
  };
}

function validateIfVersion(
  collection: CollectionDefinition,
  ifVersion: string | number | undefined,
): void {
  if (ifVersion !== undefined && !collection.optimisticLock) {
    invalid(
      'INVALID_MUTATION',
      'ifVersion requires Collection optimistic locking.',
      { collection: collection.name, path: ['ifVersion'] },
    );
  }
}

function assertWritableCollection(collection: CollectionDefinition): void {
  if ((collection.kind ?? 'table') !== 'table') {
    invalid(
      'READ_ONLY_COLLECTION',
      'Repository V1 treats views as read-only.',
      {
        collection: collection.name,
      },
    );
  }
}

function scalarFields(collection: CollectionDefinition): FieldDefinition[] {
  return (collection.fields ?? []).filter(isScalarField);
}

function relationFields(
  collection: CollectionDefinition,
): RelationFieldDefinition[] {
  return (collection.fields ?? []).filter(isRelationField);
}

function directField(
  collection: CollectionDefinition,
  name: string,
  path: readonly (string | number)[],
): AnyFieldDefinition {
  const field = collection.fields?.find((candidate) => candidate.name === name);
  if (!field) {
    invalid('FIELD_NOT_FOUND', `Field "${name}" does not exist.`, {
      collection: collection.name,
      field: name,
      path,
    });
  }
  return field;
}

function scalarField(
  collection: CollectionDefinition,
  name: string,
  path: readonly (string | number)[],
): FieldDefinition {
  const field = directField(collection, name, path);
  if (!isScalarField(field)) {
    invalid(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `Field "${name}" is a relation.`,
      {
        collection: collection.name,
        field: name,
        path,
      },
    );
  }
  return field;
}

function isScalarField(field: AnyFieldDefinition): field is FieldDefinition {
  return !('target' in field);
}

function isRelationField(
  field: AnyFieldDefinition,
): field is RelationFieldDefinition {
  return 'target' in field;
}

function uniqueConstraints(
  collection: CollectionDefinition,
): Array<Extract<ConstraintDefinition, { type: 'primary' | 'unique' }>> {
  return (collection.constraints ?? []).filter(
    (
      constraint,
    ): constraint is Extract<
      ConstraintDefinition,
      { type: 'primary' | 'unique' }
    > => constraint.type === 'primary' || constraint.type === 'unique',
  );
}

function includeExecutionFields(
  collection: CollectionDefinition,
  fields: readonly string[],
): string[] {
  const result = [...fields];
  const identity = uniqueConstraints(collection)[0]?.fields ?? [];
  for (const field of identity) {
    if (!result.includes(field)) result.push(field);
  }
  const version = collection.optimisticLock?.field;
  if (version && !result.includes(version)) result.push(version);
  return result;
}

function pick(
  record: RepositoryRecord,
  fields: readonly string[],
): RepositoryRecord {
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

function uniqueFilter(unique: UniqueSelector): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: unique.fields.map((field) => ({
        kind: 'condition',
        path: [field],
        operator: '$eq',
        value: unique.values[field] as FilterValue,
      })),
    },
  };
}

function relationNotSupported(
  collection: CollectionDefinition,
  path?: readonly (string | number)[],
): never {
  return invalid(
    'FIELD_CAPABILITY_NOT_SUPPORTED',
    'Relation Repository operations are not available in the scalar execution slice.',
    { collection: collection.name, path },
  );
}

function recordNotFound(collection: CollectionDefinition): never {
  return invalid('RECORD_NOT_FOUND', 'Repository record was not found.', {
    collection: collection.name,
  });
}

function versionConflict(collection: CollectionDefinition): never {
  return invalid(
    'VERSION_CONFLICT',
    'Repository record version does not match.',
    {
      collection: collection.name,
      retryable: true,
    },
  );
}

function toValidationError(error: RepositoryError): MutationValidationError {
  return {
    code: error.code,
    message: error.message,
    path: error.path,
    collection: error.collection,
    field: error.field,
    relation: error.relation,
    retryable: error.retryable,
    details: error.details,
  };
}

function isPlainRecord(value: unknown): value is RepositoryRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function invalid(
  code: ConstructorParameters<typeof RepositoryError>[0],
  message: string,
  options: ConstructorParameters<typeof RepositoryError>[2] = {},
): never {
  throw new RepositoryError(code, message, options);
}
