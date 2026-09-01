import { NoopSchemaAdapter, type SchemaAdapter } from '../../schema/adapter.js';
import {
  planCapabilities,
  throwIfStrictWarnings,
} from '../../schema/capabilities.js';
import {
  CollectionCompiler,
  type CollectionCompilerContext,
} from '../compiler/index.js';
import {
  FluentCollectionAlterBuilder,
  FluentCollectionDefinitionBuilder,
  FluentViewCollectionDefinitionBuilder,
} from '../fluent/index.js';
import {
  InMemoryCollectionMetadataStore,
  type CollectionMetadataStore,
} from '../../metadata/index.js';
import type {
  AnyFieldDefinition,
  BuilderExecOptions,
  BuilderImpact,
  BuilderResult,
  CollectionAlterDefinition,
  CollectionAlterInput,
  CollectionDefinition,
  CollectionDefinitionInput,
  CollectionMetadataPatch,
  CollectionOperation,
  ConstraintDefinition,
  FieldAlterInput,
  FieldMetadataPatch,
  IndexDefinition,
  MaterializedViewCollectionInput,
  MetadataUpdateOptions,
  NamingOptions,
  RefreshMaterializedViewOptions,
  ViewCollectionInput,
  RelationFieldDefinition,
} from '../types.js';

export interface CollectionBuilderOptions {
  schemaAdapter?: SchemaAdapter;
  metadataStore?: CollectionMetadataStore;
  naming?: NamingOptions;
}

export type CollectionNamingDifferenceKind = 'tableName' | 'columnName';

export interface CollectionNamingDifference {
  kind: CollectionNamingDifferenceKind;
  collection: string;
  field?: string;
  legacyValue: string;
  expectedValue: string;
}

export class CollectionNamingCompatibilityError extends Error {
  readonly code = 'COLLECTION_NAMING_INCOMPATIBLE' as const;
  readonly differences: CollectionNamingDifference[];

  constructor(differences: CollectionNamingDifference[]) {
    super(formatNamingCompatibilityError(differences));
    this.name = 'CollectionNamingCompatibilityError';
    this.differences = differences;
  }
}

export type CollectionRenameDependencyKind =
  | 'relationTarget'
  | 'relationThrough'
  | 'foreignKey'
  | 'structuredView'
  | 'rawView';

export interface CollectionRenameDependency {
  kind: CollectionRenameDependencyKind;
  collection: string;
  path: string;
}

export class CollectionRenameDependencyError extends Error {
  readonly code = 'COLLECTION_RENAME_HAS_DEPENDENCIES' as const;
  readonly from: string;
  readonly to: string;
  readonly dependencies: CollectionRenameDependency[];

  constructor(
    from: string,
    to: string,
    dependencies: CollectionRenameDependency[],
  ) {
    super(formatRenameDependencyError(from, to, dependencies));
    this.name = 'CollectionRenameDependencyError';
    this.from = from;
    this.to = to;
    this.dependencies = dependencies;
  }
}

export class CollectionBuilder {
  private readonly schemaAdapter: SchemaAdapter;
  private readonly metadataStore: CollectionMetadataStore;
  private readonly compiler: CollectionCompiler;

  constructor(options: CollectionBuilderOptions = {}) {
    assertSupportedBuilderOptions(options);
    this.schemaAdapter = options.schemaAdapter ?? new NoopSchemaAdapter();
    this.metadataStore =
      options.metadataStore ?? new InMemoryCollectionMetadataStore();
    this.compiler = new CollectionCompiler({
      naming: options.naming,
    });
  }

  async createCollection(
    name: string,
    input: CollectionDefinitionInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const definition = normalizeCollectionInput(input);
    return this.apply(
      [{ type: 'createCollection', name, definition }],
      options,
    );
  }

  async alterCollection(
    name: string,
    input: CollectionAlterInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const changes = normalizeAlterInput(input);
    return this.apply(
      [{ type: 'alterCollection', collection: name, changes }],
      options,
    );
  }

  async dropCollection(
    name: string,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply([{ type: 'dropCollection', collection: name }], options);
  }

  async renameCollection(
    oldName: string,
    newName: string,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [
        {
          type: 'renameCollection',
          from: oldName,
          to: newName,
        },
      ],
      options,
    );
  }

  async createViewCollection(
    name: string,
    input: ViewCollectionInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const definition = {
      ...normalizeViewInput(input),
      kind: 'view' as const,
      writable: false,
    };
    return this.apply(
      [{ type: 'createViewCollection', name, definition }],
      options,
    );
  }

  async replaceViewCollection(
    name: string,
    input: ViewCollectionInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const definition = {
      ...normalizeViewInput(input),
      kind: 'view' as const,
      writable: false,
    };
    return this.apply(
      [{ type: 'replaceViewCollection', name, definition }],
      options,
    );
  }

  async createMaterializedViewCollection(
    name: string,
    input: MaterializedViewCollectionInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const definition = {
      ...normalizeViewInput(input),
      kind: 'materializedView' as const,
      writable: false,
    };
    return this.apply(
      [{ type: 'createMaterializedViewCollection', name, definition }],
      options,
    );
  }

  async refreshMaterializedViewCollection(
    name: string,
    options: RefreshMaterializedViewOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [
        {
          type: 'refreshMaterializedViewCollection',
          collection: name,
          concurrently: options.concurrently,
        },
      ],
      options,
    );
  }

  async addField(
    collection: string,
    field: AnyFieldDefinition,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply([{ type: 'addField', collection, field }], options);
  }

  async alterField(
    collection: string,
    field: string,
    changes: FieldAlterInput,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [{ type: 'alterField', collection, field, changes }],
      options,
    );
  }

  async dropField(
    collection: string,
    field: string,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply([{ type: 'dropField', collection, field }], options);
  }

  async addIndex(
    collection: string,
    index: IndexDefinition,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply([{ type: 'addIndex', collection, index }], options);
  }

  async dropIndex(
    collection: string,
    index: string,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply([{ type: 'dropIndex', collection, index }], options);
  }

  async addConstraint(
    collection: string,
    constraint: ConstraintDefinition,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [{ type: 'addConstraint', collection, constraint }],
      options,
    );
  }

  async dropConstraint(
    collection: string,
    constraint: string,
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [{ type: 'dropConstraint', collection, constraint }],
      options,
    );
  }

  async updateCollectionMetadata(
    collection: string,
    patch: CollectionMetadataPatch,
    options: MetadataUpdateOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [{ type: 'updateCollectionMetadata', collection, patch }],
      options,
    );
  }

  async updateFieldMetadata(
    collection: string,
    field: string,
    patch: FieldMetadataPatch,
    options: MetadataUpdateOptions = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [{ type: 'updateFieldMetadata', collection, field, patch }],
      options,
    );
  }

  async validateMetadataCompatibility(): Promise<void> {
    const differences: CollectionNamingDifference[] = [];
    for (const definition of await this.metadataStore.listCollections()) {
      const name = definition.name;
      if (!name) {
        throw new Error(
          'Stored collection metadata must include a logical collection name.',
        );
      }
      differences.push(
        ...collectNamingDifferences(definition, name, this.compiler),
      );
    }
    if (differences.length > 0) {
      throw new CollectionNamingCompatibilityError(differences);
    }
  }

  async apply(
    operations: CollectionOperation[],
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const effectiveOperations = applyExecOptions(operations, options);
    assertNoPhysicalMappingOperations(effectiveOperations);
    const compilerContext =
      await this.createCompilerContext(effectiveOperations);
    assertRenameOperations(effectiveOperations, compilerContext);
    const compiledSchemaOperations = this.compiler.compile(
      effectiveOperations,
      compilerContext,
    );
    const capabilityPlan = planCapabilities(compiledSchemaOperations, {
      capabilities: this.schemaAdapter.capabilities,
      dialect: this.schemaAdapter.dialect,
      strict: options.strict,
    });
    if (!options.dryRun) {
      throwIfStrictWarnings(capabilityPlan.warnings, options);
    }

    const schemaOperations = capabilityPlan.schemaOperations;
    const sql =
      options.previewSql && this.schemaAdapter.compile
        ? await this.schemaAdapter.compile(schemaOperations)
        : undefined;
    const impact = [
      ...createImpact(effectiveOperations),
      ...capabilityPlan.impact,
    ];

    if (!options.dryRun) {
      await this.schemaAdapter.execute(schemaOperations);
      if (options.syncMetadata !== false) {
        await this.applyMetadataChanges(
          filterMetadataOperations(
            this.compiler,
            effectiveOperations,
            schemaOperations,
            compilerContext,
          ),
          compilerContext,
        );
      }
    }

    return {
      operations: effectiveOperations,
      schemaOperations,
      sql,
      impact,
      warnings: capabilityPlan.warnings,
    };
  }

  async transaction<T>(
    fn: (builder: CollectionBuilder) => Promise<T>,
  ): Promise<T> {
    return fn(this);
  }

  private async createCompilerContext(
    operations: CollectionOperation[],
  ): Promise<CollectionCompilerContext> {
    const names = new Set<string>();
    const includesRename = operations.some(
      (operation) => operation.type === 'renameCollection',
    );
    for (const operation of operations) {
      switch (operation.type) {
        case 'createCollection':
        case 'createViewCollection':
        case 'replaceViewCollection':
        case 'createMaterializedViewCollection':
          names.add(operation.name);
          collectReferencedCollections(names, operation.definition);
          break;
        case 'alterCollection':
          names.add(operation.collection);
          collectAlterReferences(names, operation.changes);
          break;
        case 'dropCollection':
        case 'alterField':
        case 'dropField':
        case 'addIndex':
        case 'dropIndex':
        case 'dropConstraint':
        case 'updateCollectionMetadata':
        case 'updateFieldMetadata':
        case 'refreshMaterializedViewCollection':
          names.add(operation.collection);
          break;
        case 'renameCollection':
          names.add(operation.from);
          names.add(operation.to);
          break;
        case 'addField':
          names.add(operation.collection);
          collectFieldReferences(names, operation.field);
          break;
        case 'addConstraint':
          names.add(operation.collection);
          collectConstraintReferences(names, operation.constraint);
          break;
        default:
          break;
      }
    }

    const collections: Record<string, CollectionDefinition | undefined> = {};
    if (includesRename) {
      const storedCollections = await this.metadataStore.listCollections();
      for (const storedCollection of storedCollections) {
        const name = storedCollection.name;
        if (!name) {
          throw new Error(
            'Stored collection metadata must include a logical collection name.',
          );
        }
        collections[name] = normalizeStoredCollection(
          storedCollection,
          name,
          this.compiler,
        );
      }
    }
    await Promise.all(
      [...names].map(async (name) => {
        if (Object.hasOwn(collections, name)) {
          return;
        }
        const storedCollection = await this.metadataStore.getCollection(name);
        collections[name] = storedCollection
          ? normalizeStoredCollection(storedCollection, name, this.compiler)
          : undefined;
      }),
    );
    for (const operation of operations) {
      switch (operation.type) {
        case 'createCollection':
        case 'createViewCollection':
        case 'replaceViewCollection':
        case 'createMaterializedViewCollection':
          collections[operation.name] = {
            ...operation.definition,
            name: operation.name,
          };
          break;
        default:
          break;
      }
    }
    return { collections };
  }

  private async applyMetadataChanges(
    operations: CollectionOperation[],
    context: CollectionCompilerContext,
  ): Promise<void> {
    for (const operation of operations) {
      switch (operation.type) {
        case 'createCollection':
        case 'createViewCollection':
        case 'replaceViewCollection':
        case 'createMaterializedViewCollection':
          await this.metadataStore.saveCollection(operation.name, {
            ...operation.definition,
            name: operation.name,
          });
          break;
        case 'dropCollection':
          await this.metadataStore.removeCollection(operation.collection);
          break;
        case 'renameCollection': {
          const current = context.collections?.[operation.from] ??
            (await this.getStoredCollection(operation.from)) ?? {
              name: operation.from,
              fields: [],
            };
          const next: CollectionDefinition = {
            ...current,
            name: operation.to,
          };
          await this.metadataStore.renameCollection(
            operation.from,
            operation.to,
            next,
          );
          break;
        }
        case 'alterCollection': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(
              current ?? { name: operation.collection },
              operation.changes,
            ),
          );
          break;
        }
        case 'addField': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(operation.collection, {
            ...(current ?? { name: operation.collection }),
            fields: [...(current?.fields ?? []), operation.field],
          });
          break;
        }
        case 'alterField': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              alterFields: [
                { name: operation.field, changes: operation.changes },
              ],
            }),
          );
          break;
        }
        case 'dropField': {
          const current = await this.getStoredCollection(operation.collection);
          if (current) {
            await this.metadataStore.saveCollection(operation.collection, {
              ...current,
              fields: current.fields?.filter(
                (field) => field.name !== operation.field,
              ),
            });
          }
          break;
        }
        case 'addIndex': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              addIndexes: [operation.index],
            }),
          );
          break;
        }
        case 'dropIndex': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              dropIndexes: [operation.index],
            }),
          );
          break;
        }
        case 'addConstraint': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              addConstraints: [operation.constraint],
            }),
          );
          break;
        }
        case 'dropConstraint': {
          const current = await this.getStoredCollection(operation.collection);
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              dropConstraints: [operation.constraint],
            }),
          );
          break;
        }
        case 'updateCollectionMetadata': {
          const current = await this.getStoredCollection(operation.collection);
          if (current) {
            await this.metadataStore.saveCollection(
              operation.collection,
              current,
            );
          }
          await this.metadataStore.patchCollection(
            operation.collection,
            operation.patch,
          );
          break;
        }
        case 'updateFieldMetadata': {
          const current = await this.getStoredCollection(operation.collection);
          if (current) {
            await this.metadataStore.saveCollection(
              operation.collection,
              current,
            );
          }
          await this.metadataStore.patchField(
            operation.collection,
            operation.field,
            operation.patch,
          );
          break;
        }
        default:
          break;
      }
    }
  }

  private async getStoredCollection(
    name: string,
  ): Promise<CollectionDefinition | undefined> {
    const definition = await this.metadataStore.getCollection(name);
    return definition
      ? normalizeStoredCollection(definition, name, this.compiler)
      : undefined;
  }
}

function normalizeCollectionInput(
  input: CollectionDefinitionInput,
): CollectionDefinition {
  const definition = (() => {
    if (typeof input !== 'function') {
      return input;
    }
    const builder = new FluentCollectionDefinitionBuilder();
    input(builder);
    return builder.toDefinition();
  })();
  assertNoPhysicalMappings(definition, definition.name ?? '(new collection)');
  return definition;
}

function assertNoPhysicalMappingOperations(
  operations: CollectionOperation[],
): void {
  for (const operation of operations) {
    switch (operation.type) {
      case 'createCollection':
      case 'createViewCollection':
      case 'replaceViewCollection':
      case 'createMaterializedViewCollection':
        assertNoPhysicalMappings(operation.definition, operation.name);
        break;
      case 'alterCollection':
        assertNoPhysicalMappings(
          { fields: operation.changes.addFields ?? [] },
          operation.collection,
        );
        assertNoPhysicalFieldAlterMappings(
          operation.collection,
          operation.changes,
        );
        break;
      case 'addField':
        assertNoPhysicalMappings(
          { fields: [operation.field] },
          operation.collection,
        );
        break;
      case 'alterField':
        assertNoPhysicalFieldMapping(
          operation.collection,
          operation.field,
          operation.changes,
        );
        break;
      default:
        break;
    }
  }
}

function normalizeAlterInput(
  input: CollectionAlterInput,
): CollectionAlterDefinition {
  const changes = (() => {
    if (typeof input !== 'function') {
      return input;
    }
    const builder = new FluentCollectionAlterBuilder();
    input(builder);
    return builder.toAlterDefinition();
  })();
  assertNoPhysicalMappings(
    { fields: changes.addFields ?? [] },
    '(altered collection)',
  );
  assertNoPhysicalFieldAlterMappings('(altered collection)', changes);
  return changes;
}

function normalizeViewInput(input: ViewCollectionInput): CollectionDefinition {
  if (typeof input === 'function') {
    const builder = new FluentViewCollectionDefinitionBuilder();
    input(builder);
    return builder.toDefinition();
  }
  assertNoPhysicalMappings(input, input.name ?? '(new view)');
  return input;
}

function applyExecOptions(
  operations: CollectionOperation[],
  options: Pick<BuilderExecOptions, 'ifNotExists' | 'ifExists'>,
): CollectionOperation[] {
  return operations.map((operation) => {
    switch (operation.type) {
      case 'createCollection': {
        const ifNotExists = operation.ifNotExists ?? options.ifNotExists;
        if (ifNotExists === undefined) {
          return operation;
        }
        return {
          ...operation,
          ifNotExists,
        };
      }
      case 'dropCollection': {
        const ifExists = operation.ifExists ?? options.ifExists;
        if (ifExists === undefined) {
          return operation;
        }
        return {
          ...operation,
          ifExists,
        };
      }
      default:
        return operation;
    }
  });
}

function createImpact(operations: CollectionOperation[]): BuilderImpact[] {
  return operations.map((operation) => {
    switch (operation.type) {
      case 'dropField':
        return {
          level: 'destructive',
          operation: operation.type,
          message: `Dropping field ${operation.collection}.${operation.field} may remove existing data.`,
        };
      case 'dropCollection':
        return {
          level: 'destructive',
          operation: operation.type,
          message: `Dropping collection ${operation.collection} may remove the backing database object.`,
        };
      case 'updateCollectionMetadata':
      case 'updateFieldMetadata':
        return {
          level: 'safe',
          operation: operation.type,
          message: 'Only collection metadata will be updated.',
        };
      default:
        return {
          level: 'safe',
          operation: operation.type,
          message: `Operation ${operation.type} is planned.`,
        };
    }
  });
}

export function createCollectionBuilder(
  options: CollectionBuilderOptions = {},
): CollectionBuilder {
  return new CollectionBuilder(options);
}

function filterMetadataOperations(
  compiler: CollectionCompiler,
  operations: CollectionOperation[],
  schemaOperations: ReturnType<CollectionCompiler['compile']>,
  context: CollectionCompilerContext,
): CollectionOperation[] {
  const plannedViewNames = new Set(
    schemaOperations
      .filter((operation) => operation.type === 'createView')
      .map((operation) => operation.view.name),
  );

  return operations.filter(
    (operation) =>
      !isViewMetadataOperation(operation) ||
      compiler
        .compile([operation], context)
        .every(
          (schemaOperation) =>
            schemaOperation.type !== 'createView' ||
            plannedViewNames.has(schemaOperation.view.name),
        ),
  );
}

function isViewMetadataOperation(operation: CollectionOperation): boolean {
  return (
    operation.type === 'createViewCollection' ||
    operation.type === 'replaceViewCollection' ||
    operation.type === 'createMaterializedViewCollection'
  );
}

function applyAlterMetadata(
  current: CollectionDefinition,
  changes: CollectionAlterDefinition,
): CollectionDefinition {
  let fields = [...(current.fields ?? [])];
  fields.push(...(changes.addFields ?? []));
  for (const field of changes.alterFields ?? []) {
    const index = fields.findIndex((item) => item.name === field.name);
    if (index >= 0) {
      fields[index] = {
        ...fields[index],
        ...field.changes,
      } as AnyFieldDefinition;
    } else {
      fields.push({ name: field.name, type: 'virtual', ...field.changes });
    }
  }
  fields = fields.filter(
    (field) => !(changes.dropFields ?? []).includes(field.name),
  );

  let indexes = [...(current.indexes ?? []), ...(changes.addIndexes ?? [])];
  indexes = indexes.filter(
    (index) => !index.name || !(changes.dropIndexes ?? []).includes(index.name),
  );

  let constraints = [
    ...(current.constraints ?? []),
    ...(changes.addConstraints ?? []),
  ];
  constraints = constraints.filter(
    (constraint) =>
      !constraint.name ||
      !(changes.dropConstraints ?? []).includes(constraint.name),
  );

  return {
    ...current,
    fields,
    indexes,
    constraints,
  };
}

function collectReferencedCollections(
  names: Set<string>,
  definition: CollectionDefinition,
): void {
  for (const field of definition.fields ?? []) {
    collectFieldReferences(names, field);
  }
  for (const constraint of definition.constraints ?? []) {
    collectConstraintReferences(names, constraint);
  }
  if (definition.view?.as?.from) {
    names.add(definition.view.as.from);
  }
}

function collectAlterReferences(
  names: Set<string>,
  changes: CollectionAlterDefinition,
): void {
  for (const field of changes.addFields ?? []) {
    collectFieldReferences(names, field);
  }
  for (const constraint of changes.addConstraints ?? []) {
    collectConstraintReferences(names, constraint);
  }
}

function collectFieldReferences(
  names: Set<string>,
  field: AnyFieldDefinition,
): void {
  if (!isRelationField(field)) {
    return;
  }

  names.add(field.target);
  if (field.through) {
    names.add(field.through);
  }
}

function isRelationField(
  field: AnyFieldDefinition,
): field is RelationFieldDefinition {
  return (
    'target' in field &&
    typeof field.target === 'string' &&
    (field.type === 'belongsTo' ||
      field.type === 'hasOne' ||
      field.type === 'hasMany' ||
      field.type === 'belongsToMany')
  );
}

function collectConstraintReferences(
  names: Set<string>,
  constraint: ConstraintDefinition,
): void {
  if (constraint.type === 'foreignKey') {
    names.add(constraint.references.collection);
  }
}

function assertSupportedBuilderOptions(
  options: CollectionBuilderOptions,
): void {
  if ('namingStrategy' in options) {
    throw new Error(
      'CollectionBuilder no longer supports a custom namingStrategy. Use connection or collection naming.tablePrefix instead.',
    );
  }
}

function assertNoPhysicalMappings(
  definition: CollectionDefinition,
  collection: string,
): void {
  if ('tableName' in definition) {
    throw new Error(
      `Collection "${collection}" no longer supports tableName. Use naming with a logical collection name instead.`,
    );
  }
  for (const field of definition.fields ?? []) {
    assertNoPhysicalFieldMapping(collection, field.name, field);
  }
}

function assertNoPhysicalFieldAlterMappings(
  collection: string,
  changes: CollectionAlterDefinition,
): void {
  for (const field of changes.alterFields ?? []) {
    assertNoPhysicalFieldMapping(collection, field.name, field.changes);
  }
}

function assertNoPhysicalFieldMapping(
  collection: string,
  field: string,
  definition: object,
): void {
  if ('columnName' in definition) {
    throw new Error(
      `Field "${collection}.${field}" no longer supports columnName. Its physical column name is derived from the logical field name and naming options.`,
    );
  }
}

function normalizeStoredCollection(
  definition: CollectionDefinition,
  name: string,
  compiler: CollectionCompiler,
): CollectionDefinition {
  const differences = collectNamingDifferences(definition, name, compiler);
  if (differences.length > 0) {
    throw new CollectionNamingCompatibilityError(differences);
  }

  const legacy = definition as CollectionDefinition & {
    tableName?: unknown;
    naming?: NamingOptions;
  };
  const normalized: CollectionDefinition = { ...definition, name };
  delete (normalized as CollectionDefinition & { tableName?: unknown })
    .tableName;
  normalized.naming = legacy.naming ? { ...legacy.naming } : undefined;
  normalized.fields = definition.fields?.map((field) => {
    const normalizedField = { ...field } as AnyFieldDefinition & {
      columnName?: unknown;
    };
    delete normalizedField.columnName;
    return normalizedField;
  });
  return normalized;
}

function collectNamingDifferences(
  definition: CollectionDefinition,
  name: string,
  compiler: CollectionCompiler,
): CollectionNamingDifference[] {
  const differences: CollectionNamingDifference[] = [];
  const legacy = definition as CollectionDefinition & {
    tableName?: unknown;
    naming?: NamingOptions;
  };

  const expectedTableName = compiler.effectiveTableName(name, definition);
  const legacyTableName =
    typeof legacy.tableName === 'string' ? legacy.tableName : expectedTableName;
  if (legacyTableName !== expectedTableName) {
    differences.push({
      kind: 'tableName',
      collection: name,
      legacyValue: legacyTableName,
      expectedValue: expectedTableName,
    });
  }

  for (const field of definition.fields ?? []) {
    const legacyField = field as AnyFieldDefinition & { columnName?: unknown };
    const legacyColumnName = legacyPhysicalColumnName(
      legacyField,
      definition,
      compiler,
    );
    if (!legacyColumnName) {
      continue;
    }
    const expectedColumnName = deterministicPhysicalColumnName(
      field,
      definition,
      compiler,
    );
    if (!expectedColumnName) {
      continue;
    }
    if (legacyColumnName !== expectedColumnName) {
      differences.push({
        kind: 'columnName',
        collection: name,
        field: field.name,
        legacyValue: legacyColumnName,
        expectedValue: expectedColumnName,
      });
    }
  }

  return differences;
}

function deterministicPhysicalColumnName(
  field: AnyFieldDefinition,
  definition: CollectionDefinition,
  compiler: CollectionCompiler,
): string | undefined {
  if (isRelationField(field)) {
    if (field.type !== 'belongsTo' || field.foreignKey) {
      return undefined;
    }
    return `${compiler.effectiveColumnName(field.name, definition)}_id`;
  }
  return compiler.effectiveColumnName(field.name, definition);
}

function legacyPhysicalColumnName(
  field: AnyFieldDefinition & { columnName?: unknown },
  definition: CollectionDefinition,
  compiler: CollectionCompiler,
): string | undefined {
  if (typeof field.columnName === 'string') {
    return field.columnName;
  }
  if (isRelationField(field)) {
    if (field.type !== 'belongsTo' || field.foreignKey) {
      return undefined;
    }
    return `${compiler.effectiveColumnName(field.name, definition)}_id`;
  }
  return compiler.effectiveColumnName(field.name, definition);
}

function assertRenameOperations(
  operations: CollectionOperation[],
  context: CollectionCompilerContext,
): void {
  for (const operation of operations) {
    if (operation.type !== 'renameCollection') {
      continue;
    }
    if (!context.collections?.[operation.from]) {
      throw new Error(
        `Cannot rename collection "${operation.from}" because its metadata does not exist.`,
      );
    }
    if (context.collections[operation.to]) {
      throw new Error(
        `Cannot rename collection "${operation.from}" to "${operation.to}" because the target collection already exists.`,
      );
    }
    const dependencies = collectRenameDependencies(
      operation.from,
      context.collections,
    );
    if (dependencies.length > 0) {
      throw new CollectionRenameDependencyError(
        operation.from,
        operation.to,
        dependencies,
      );
    }
  }
}

function collectRenameDependencies(
  target: string,
  collections: Record<string, CollectionDefinition | undefined>,
): CollectionRenameDependency[] {
  const dependencies: CollectionRenameDependency[] = [];
  for (const [collectionName, definition] of Object.entries(collections)) {
    if (!definition) {
      continue;
    }
    for (const field of definition.fields ?? []) {
      if (!isRelationField(field)) {
        continue;
      }
      if (field.target === target) {
        dependencies.push({
          kind: 'relationTarget',
          collection: collectionName,
          path: `fields.${field.name}.target`,
        });
      }
      if (field.through === target) {
        dependencies.push({
          kind: 'relationThrough',
          collection: collectionName,
          path: `fields.${field.name}.through`,
        });
      }
    }
    for (const [index, constraint] of (
      definition.constraints ?? []
    ).entries()) {
      if (
        constraint.type === 'foreignKey' &&
        constraint.references.collection === target
      ) {
        dependencies.push({
          kind: 'foreignKey',
          collection: collectionName,
          path: `constraints.${index}.references.collection`,
        });
      }
    }
    if (definition.view?.as?.from === target) {
      dependencies.push({
        kind: 'structuredView',
        collection: collectionName,
        path: 'view.as.from',
      });
    }
    if (definition.view?.asRaw) {
      dependencies.push({
        kind: 'rawView',
        collection: collectionName,
        path: 'view.asRaw',
      });
    }
  }
  return dependencies;
}

function formatNamingCompatibilityError(
  differences: CollectionNamingDifference[],
): string {
  const lines = differences.map((difference) => {
    const path = difference.field
      ? `${difference.collection}.${difference.field}`
      : difference.collection;
    return `- ${path} (${difference.kind}): legacy=${JSON.stringify(difference.legacyValue)}, expected=${JSON.stringify(difference.expectedValue)}`;
  });
  return [
    'Stored collection metadata is incompatible with the configured naming rules.',
    ...lines,
    'The database and metadata were not modified. Add an explicit migration before retrying.',
  ].join('\n');
}

function formatRenameDependencyError(
  from: string,
  to: string,
  dependencies: CollectionRenameDependency[],
): string {
  const lines = dependencies.map(
    (dependency) =>
      `- ${dependency.collection}.${dependency.path} (${dependency.kind})`,
  );
  return [
    `Cannot rename collection "${from}" to "${to}" because dependent metadata cannot be updated atomically.`,
    ...lines,
    'Rename was not applied.',
  ].join('\n');
}
