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
import type { NamingStrategy } from '../../naming/index.js';
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
  namingStrategy?: NamingStrategy;
}

export interface InspectedCollectionField {
  definition: AnyFieldDefinition;
  columnName: string;
}

export interface InspectedCollection {
  definition: CollectionDefinition;
  tableName: string;
  fields: InspectedCollectionField[];
}

export class CollectionBuilder {
  private readonly schemaAdapter: SchemaAdapter;
  private readonly metadataStore: CollectionMetadataStore;
  private readonly compiler: CollectionCompiler;

  constructor(options: CollectionBuilderOptions = {}) {
    this.schemaAdapter = options.schemaAdapter ?? new NoopSchemaAdapter();
    this.metadataStore =
      options.metadataStore ?? new InMemoryCollectionMetadataStore();
    this.compiler = new CollectionCompiler({
      naming: options.naming,
      namingStrategy: options.namingStrategy,
    });
  }

  inspectCollection(name: string): InspectedCollection | undefined {
    if (!this.metadataStore.getCollectionSync) {
      throw new Error(
        'The configured collection metadata store does not support synchronous inspection.',
      );
    }
    const definition = this.metadataStore.getCollectionSync(name);
    if (!definition) {
      return undefined;
    }
    return {
      definition,
      tableName: this.compiler.effectiveTableName(name, definition),
      fields: (definition.fields ?? []).map((field) => ({
        definition: field,
        columnName: this.compiler.effectiveColumnName(
          field.name,
          field,
          definition,
        ),
      })),
    };
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

  async registerCollectionMetadata(
    name: string,
    input: CollectionDefinitionInput,
  ): Promise<void> {
    const definition = normalizeCollectionInput(input);
    await this.metadataStore.saveCollection(name, {
      ...definition,
      name,
    });
  }

  async removeCollectionMetadata(name: string): Promise<void> {
    await this.metadataStore.removeCollection(name);
  }

  /** Renames the logical collection while preserving its physical table name. */
  async renameCollectionMetadata(from: string, to: string): Promise<void> {
    const current = await this.metadataStore.getCollection(from);
    if (!current) {
      return;
    }
    await this.metadataStore.removeCollection(from);
    await this.metadataStore.saveCollection(to, {
      ...current,
      name: to,
      tableName: this.compiler.effectiveTableName(from, current),
    });
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
    options: BuilderExecOptions & {
      renameTable?: boolean;
      renameTableTo?: string;
    } = {},
  ): Promise<BuilderResult> {
    return this.apply(
      [
        {
          type: 'renameCollection',
          from: oldName,
          to: newName,
          renameTable: options.renameTable,
          renameTableTo: options.renameTableTo,
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

  async apply(
    operations: CollectionOperation[],
    options: BuilderExecOptions = {},
  ): Promise<BuilderResult> {
    const effectiveOperations = applyExecOptions(operations, options);
    assertNoRelationColumnNameOperations(effectiveOperations);
    const compilerContext =
      await this.createCompilerContext(effectiveOperations);
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
    await Promise.all(
      [...names].map(async (name) => {
        collections[name] = await this.metadataStore.getCollection(name);
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
            (await this.metadataStore.getCollection(operation.from)) ?? {
              name: operation.from,
              fields: [],
            };
          const next: CollectionDefinition = {
            ...current,
            name: operation.to,
          };
          if (operation.renameTableTo) {
            next.tableName = operation.renameTableTo;
          } else if (operation.renameTable) {
            delete next.tableName;
          } else {
            next.tableName = this.compiler.effectiveTableName(
              operation.from,
              current,
            );
          }
          await this.metadataStore.removeCollection(operation.from);
          await this.metadataStore.saveCollection(operation.to, next);
          break;
        }
        case 'alterCollection': {
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
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
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
          await this.metadataStore.saveCollection(operation.collection, {
            ...(current ?? { name: operation.collection }),
            fields: [...(current?.fields ?? []), operation.field],
          });
          break;
        }
        case 'alterField': {
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
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
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
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
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              addIndexes: [operation.index],
            }),
          );
          break;
        }
        case 'dropIndex': {
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              dropIndexes: [operation.index],
            }),
          );
          break;
        }
        case 'addConstraint': {
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              addConstraints: [operation.constraint],
            }),
          );
          break;
        }
        case 'dropConstraint': {
          const current = await this.metadataStore.getCollection(
            operation.collection,
          );
          await this.metadataStore.saveCollection(
            operation.collection,
            applyAlterMetadata(current ?? { name: operation.collection }, {
              dropConstraints: [operation.constraint],
            }),
          );
          break;
        }
        case 'updateCollectionMetadata':
          await this.metadataStore.patchCollection(
            operation.collection,
            operation.patch,
          );
          break;
        case 'updateFieldMetadata':
          await this.metadataStore.patchField(
            operation.collection,
            operation.field,
            operation.patch,
          );
          break;
        default:
          break;
      }
    }
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
  assertNoRelationColumnNames(definition);
  return definition;
}

function assertNoRelationColumnNames(definition: CollectionDefinition): void {
  for (const field of definition.fields ?? []) {
    if (isRelationField(field) && 'columnName' in field) {
      throw new Error(
        `Relation field "${field.name}" does not support columnName. Define a local foreign key field and reference it with foreignKey().`,
      );
    }
  }
}

function assertNoRelationColumnNameOperations(
  operations: CollectionOperation[],
): void {
  for (const operation of operations) {
    switch (operation.type) {
      case 'createCollection':
      case 'createViewCollection':
      case 'replaceViewCollection':
      case 'createMaterializedViewCollection':
        assertNoRelationColumnNames(operation.definition);
        break;
      case 'alterCollection':
        assertNoRelationColumnNames({
          fields: operation.changes.addFields ?? [],
        });
        break;
      case 'addField':
        assertNoRelationColumnNames({ fields: [operation.field] });
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
  for (const field of changes.addFields ?? []) {
    if (isRelationField(field) && 'columnName' in field) {
      throw new Error(
        `Relation field "${field.name}" does not support columnName. Define a local foreign key field and reference it with foreignKey().`,
      );
    }
  }
  return changes;
}

function normalizeViewInput(input: ViewCollectionInput): CollectionDefinition {
  if (typeof input === 'function') {
    const builder = new FluentViewCollectionDefinitionBuilder();
    input(builder);
    return builder.toDefinition();
  }
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
