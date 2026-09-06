import type {
  AnyFieldDefinition,
  CollectionDefinition,
  CollectionKind,
  ConstraintDefinition,
  Deferrable,
  FieldDefinition,
  IndexDefinition,
  NamingOptions,
  ReferentialAction,
  RelationFieldDefinition,
} from '../types.js';
import type {
  FieldMetadata,
  RelationMetadata,
} from '../../metadata/document.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import type {
  PhysicalCollectionKind,
  PhysicalColumnSchema,
  PhysicalForeignKeySchema,
  PhysicalIndexKey,
  PhysicalIndexSchema,
  PhysicalReferentialAction,
  PhysicalSchemaAspect,
} from '../../schema/inspector/types.js';
import {
  CollectionResolutionError,
  type CollectionResolutionIssue,
  type CollectionResolutionIssueCode,
} from './errors.js';
import type {
  CollectionNamingIdentity,
  CollectionResolutionInput,
  CollectionResolutionResult,
  CollectionResolutionWarning,
} from './types.js';

const INSPECTION_ASPECTS: readonly PhysicalSchemaAspect[] = [
  'columns',
  'primaryKey',
  'uniqueConstraints',
  'indexes',
  'foreignKeys',
  'checkConstraints',
  'comments',
  'viewDefinition',
];

interface ResolvedColumns {
  readonly fields: FieldDefinition[];
  readonly byLogicalName: ReadonlyMap<string, FieldDefinition>;
  readonly logicalNameByPhysicalName: ReadonlyMap<string, string>;
}

interface ResolvedIndexKey {
  readonly field?: string;
  readonly expression?: string;
  readonly order?: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
}

export class CollectionResolver {
  resolve(input: CollectionResolutionInput): CollectionResolutionResult {
    return resolveCollection(input);
  }
}

export function resolveCollection(
  input: CollectionResolutionInput,
): CollectionResolutionResult {
  const issues: CollectionResolutionIssue[] = [];
  const warnings = resolveWarnings(input);
  if (input.physical.inspection.aspects.columns !== 'complete') {
    issues.push(
      issue(
        'COLLECTION_SCHEMA_INCOMPLETE',
        ['inspection', 'aspects', 'columns'],
        'Physical columns must be completely inspected before resolving a Collection.',
      ),
    );
  }

  const naming = effectiveNaming(input.naming, input.metadata?.naming);
  const strategy = new DefaultNamingStrategy(naming);
  const collectionName = resolveCollectionName(input, naming, strategy, issues);
  const columns = resolveColumns(input, naming, issues);
  applyFieldMetadata(input.metadata?.fields, columns, issues);

  const constraints = resolveConstraints(input, columns, issues);
  const indexes = resolveIndexes(input, columns, issues);
  addUniqueIndexConstraints(constraints, indexes);
  const relations = resolveRelations(
    input.metadata?.relations,
    columns,
    issues,
  );
  const view = resolveView(input, issues);
  const optimisticLock = resolveOptimisticLock(input, columns, issues);

  if (issues.length > 0 || !collectionName) {
    throw new CollectionResolutionError(issues);
  }

  const fields: AnyFieldDefinition[] = [...columns.fields, ...relations];
  const collection = pruneUndefined<CollectionDefinition>({
    kind: resolveCollectionKind(input.physical.kind),
    name: collectionName,
    naming,
    title: input.metadata?.title,
    description: input.metadata?.description,
    db: pruneUndefined({
      schema: input.physical.schema,
      comment: input.physical.comment,
      physicalKind:
        input.physical.kind === 'partitionedTable' ||
        input.physical.kind === 'foreignTable'
          ? input.physical.kind
          : undefined,
    }),
    fields,
    constraints,
    indexes,
    view,
    optimisticLock,
  });

  return {
    collection,
    inspection: input.physical.inspection,
    warnings,
  };
}

function addUniqueIndexConstraints(
  constraints: ConstraintDefinition[],
  indexes: readonly IndexDefinition[],
): void {
  for (const index of indexes) {
    if (
      index.db?.unique !== true ||
      !index.fields?.length ||
      index.expressions?.length ||
      index.predicate ||
      constraints.some(
        (constraint) =>
          constraint.type === 'unique' &&
          sameFieldSet(constraint.fields, index.fields!),
      )
    ) {
      continue;
    }
    constraints.push({
      type: 'unique',
      fields: [...index.fields],
      name: index.name,
      mode: 'index',
    });
  }
}

function sameFieldSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((field) => right.includes(field))
  );
}

function resolveOptimisticLock(
  input: CollectionResolutionInput,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): CollectionDefinition['optimisticLock'] | undefined {
  const definition = input.metadata?.optimisticLock;
  if (!definition) return undefined;
  if (
    input.physical.kind === 'view' ||
    input.physical.kind === 'materializedView'
  ) {
    issues.push(
      issue(
        'COLLECTION_OPTIMISTIC_LOCK_INVALID',
        ['metadata', 'optimisticLock'],
        'Optimistic locking is only supported for table Collections.',
      ),
    );
    return undefined;
  }
  const field = columns.byLogicalName.get(definition.field);
  if (!field) {
    issues.push(
      issue(
        'COLLECTION_OPTIMISTIC_LOCK_INVALID',
        ['metadata', 'optimisticLock', 'field'],
        `Optimistic lock Field "${definition.field}" does not exist as a direct Field.`,
      ),
    );
    return undefined;
  }
  if (field.type !== 'integer' && field.type !== 'bigInt') {
    issues.push(
      issue(
        'COLLECTION_OPTIMISTIC_LOCK_INVALID',
        ['metadata', 'optimisticLock', 'field'],
        `Optimistic lock Field "${definition.field}" must be integer or bigInt.`,
      ),
    );
  }
  if (field.nullable !== false) {
    issues.push(
      issue(
        'COLLECTION_OPTIMISTIC_LOCK_INVALID',
        ['metadata', 'optimisticLock', 'field'],
        `Optimistic lock Field "${definition.field}" must be non-nullable.`,
      ),
    );
  }
  return { ...definition };
}

function effectiveNaming(
  connection: NamingOptions | undefined,
  collection: NamingOptions | undefined,
): Required<NamingOptions> {
  return {
    underscored: collection?.underscored ?? connection?.underscored ?? true,
    tablePrefix: collection?.tablePrefix ?? connection?.tablePrefix ?? '',
  };
}

function resolveCollectionName(
  input: CollectionResolutionInput,
  naming: Required<NamingOptions>,
  strategy: DefaultNamingStrategy,
  issues: CollectionResolutionIssue[],
): string | undefined {
  if (input.metadata) {
    const expected = strategy.collectionToTableName(input.metadata.name);
    if (expected !== input.physical.tableName) {
      issues.push(
        issue(
          'COLLECTION_SCHEMA_DRIFT',
          ['metadata', 'name'],
          `Metadata Collection "${input.metadata.name}" maps to physical table "${expected}", not "${input.physical.tableName}".`,
        ),
      );
    }
    return input.metadata.name;
  }

  const prefix = strategy.collectionToTableName('');
  if (!input.physical.tableName.startsWith(prefix)) {
    issues.push(
      issue(
        'COLLECTION_NAME_CONFLICT',
        ['physical', 'tableName'],
        `Physical table "${input.physical.tableName}" does not use the configured prefix "${prefix}".`,
      ),
    );
    return undefined;
  }
  const unprefixed = input.physical.tableName.slice(prefix.length);
  const name = reverseIdentifier(unprefixed, naming.underscored);
  if (
    !name ||
    strategy.collectionToTableName(name) !== input.physical.tableName
  ) {
    issues.push(
      issue(
        'COLLECTION_NAME_CONFLICT',
        ['physical', 'tableName'],
        `Physical table "${input.physical.tableName}" cannot be deterministically mapped to a logical Collection name.`,
      ),
    );
    return undefined;
  }
  return name;
}

function resolveColumns(
  input: CollectionResolutionInput,
  naming: Required<NamingOptions>,
  issues: CollectionResolutionIssue[],
): ResolvedColumns {
  const strategy = new DefaultNamingStrategy(naming);
  const fields: FieldDefinition[] = [];
  const byLogicalName = new Map<string, FieldDefinition>();
  const logicalNameByPhysicalName = new Map<string, string>();
  const columns = [...input.physical.columns].sort(
    (left, right) => left.ordinalPosition - right.ordinalPosition,
  );

  for (const [index, column] of columns.entries()) {
    const path = ['physical', 'columns', index] as const;
    const name = reverseIdentifier(column.columnName, naming.underscored);
    if (!name || strategy.fieldToColumnName(name) !== column.columnName) {
      issues.push(
        issue(
          'COLLECTION_NAME_CONFLICT',
          [...path, 'columnName'],
          `Physical column "${column.columnName}" cannot be deterministically mapped to a logical Field name.`,
        ),
      );
      continue;
    }
    if (byLogicalName.has(name)) {
      issues.push(
        issue(
          'COLLECTION_FIELD_CONFLICT',
          [...path, 'columnName'],
          `Physical column "${column.columnName}" maps to duplicate logical Field "${name}".`,
        ),
      );
      continue;
    }
    if (logicalNameByPhysicalName.has(column.columnName)) {
      issues.push(
        issue(
          'COLLECTION_FIELD_CONFLICT',
          [...path, 'columnName'],
          `Physical column "${column.columnName}" is reported more than once.`,
        ),
      );
      continue;
    }

    const field = resolveColumn(column, name);
    fields.push(field);
    byLogicalName.set(name, field);
    logicalNameByPhysicalName.set(column.columnName, name);
  }

  return { fields, byLogicalName, logicalNameByPhysicalName };
}

function resolveColumn(
  column: PhysicalColumnSchema,
  name: string,
): FieldDefinition {
  const db = pruneUndefined({
    nativeType: column.nativeType,
    nativeTypeSchema: column.nativeTypeSchema,
    comment: column.comment,
    defaultExpression: column.default?.expression,
    generated: column.generated
      ? pruneUndefined({
          expression: column.generated.expression,
          stored: column.generated.stored,
        })
      : undefined,
  });
  const defaultValue =
    column.default && Object.hasOwn(column.default, 'value')
      ? column.default.value
      : undefined;
  return pruneUndefined<FieldDefinition>({
    name,
    type: column.dataType,
    nullable: column.nullable,
    defaultValue,
    autoIncrement: column.autoIncrement,
    length: column.length,
    precision: column.precision,
    scale: column.scale,
    fractionalSecondsPrecision: column.fractionalSecondsPrecision,
    unsigned: column.unsigned,
    db,
  });
}

function applyFieldMetadata(
  metadata: Record<string, FieldMetadata> | undefined,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): void {
  if (!metadata) return;
  for (const [name, fieldMetadata] of Object.entries(metadata)) {
    const field = columns.byLogicalName.get(name);
    if (!field) {
      issues.push(
        issue(
          'COLLECTION_SCHEMA_DRIFT',
          ['metadata', 'fields', name],
          `Metadata references Field "${name}", but no matching physical column exists.`,
        ),
      );
      continue;
    }
    field.title = fieldMetadata.title;
    field.description = fieldMetadata.description;
    if (fieldMetadata.type !== undefined) {
      const compatible =
        field.type === fieldMetadata.type ||
        fieldMetadata.type === 'native' ||
        fieldMetadata.type.toLowerCase() ===
          String(field.db?.nativeType).toLowerCase() ||
        (['decimal', 'double'].includes(fieldMetadata.type) &&
          field.type === 'float') ||
        (fieldMetadata.type === 'float' && field.type === 'double') ||
        (fieldMetadata.type === 'uuid' &&
          (field.type === 'string' || field.type === 'blob')) ||
        (['date', 'time', 'datetime', 'datetimeTz'].includes(
          fieldMetadata.type,
        ) &&
          field.type === 'text') ||
        (fieldMetadata.type === 'datetimeTz' &&
          field.type === 'datetime' &&
          /^datetime(?:\(\d+\))?$/i.test(String(field.db?.nativeType))) ||
        (fieldMetadata.type === 'time' &&
          field.type === 'string' &&
          (field.length ?? 0) >= 8) ||
        (fieldMetadata.type === 'date' &&
          field.type === 'datetime' &&
          String(field.db?.nativeType).toLowerCase() === 'date') ||
        (fieldMetadata.type === 'boolean' &&
          (field.type === 'integer' ||
            (field.type === 'decimal' && field.scale === 0))) ||
        (fieldMetadata.type === 'json' &&
          (field.type === 'text' || field.type === 'string'));
      if (!compatible) {
        issues.push(
          issue(
            'COLLECTION_SCHEMA_DRIFT',
            ['metadata', 'fields', name, 'type'],
            `Logical type "${fieldMetadata.type}" is incompatible with physical type "${field.type}" for Field "${name}".`,
          ),
        );
      } else {
        field.type = fieldMetadata.type;
      }
    }
    pruneUndefined(field);
  }
}

function resolveConstraints(
  input: CollectionResolutionInput,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): ConstraintDefinition[] {
  const constraints: ConstraintDefinition[] = [];
  if (input.physical.primaryKey) {
    const fields = resolveLocalColumns(
      input.physical.primaryKey.columns,
      ['physical', 'primaryKey', 'columns'],
      columns,
      issues,
    );
    if (fields) {
      constraints.push(
        pruneUndefined({
          type: 'primary' as const,
          name: input.physical.primaryKey.name,
          fields,
        }),
      );
    }
  }

  for (const [
    index,
    constraint,
  ] of input.physical.uniqueConstraints.entries()) {
    const fields = resolveLocalColumns(
      constraint.columns,
      ['physical', 'uniqueConstraints', index, 'columns'],
      columns,
      issues,
    );
    if (fields) {
      constraints.push(
        pruneUndefined({
          type: 'unique' as const,
          name: constraint.name,
          fields,
          deferrable: resolveDeferrable(
            constraint.deferrable,
            constraint.initiallyDeferred,
          ),
        }),
      );
    }
  }

  for (const [index, constraint] of input.physical.foreignKeys.entries()) {
    const resolved = resolveForeignKey(
      input,
      constraint,
      index,
      columns,
      issues,
    );
    if (resolved) constraints.push(resolved);
  }

  for (const constraint of input.physical.checkConstraints) {
    constraints.push(
      pruneUndefined({
        type: 'check' as const,
        name: constraint.name,
        expression: constraint.expression,
      }),
    );
  }
  return constraints;
}

function resolveForeignKey(
  input: CollectionResolutionInput,
  constraint: PhysicalForeignKeySchema,
  index: number,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): ConstraintDefinition | undefined {
  const path = ['physical', 'foreignKeys', index] as const;
  const fields = resolveLocalColumns(
    constraint.columns,
    [...path, 'columns'],
    columns,
    issues,
  );
  if (constraint.columns.length !== constraint.referencedColumns.length) {
    issues.push(
      issue(
        'COLLECTION_PHYSICAL_REFERENCE_INVALID',
        path,
        `Foreign key has ${constraint.columns.length} local columns but ${constraint.referencedColumns.length} referenced columns.`,
      ),
    );
  }
  const target = input.context.resolvePhysicalCollection(
    constraint.referencedCollection,
  );
  if (!target) {
    issues.push(
      issue(
        'COLLECTION_PHYSICAL_REFERENCE_INVALID',
        [...path, 'referencedCollection'],
        `Referenced physical Collection "${constraint.referencedCollection.schema}.${constraint.referencedCollection.tableName}" has no logical identity.`,
      ),
    );
    return undefined;
  }
  const targetStrategy = new DefaultNamingStrategy(target.naming);
  if (
    targetStrategy.collectionToTableName(target.name) !==
    constraint.referencedCollection.tableName
  ) {
    issues.push(
      issue(
        'COLLECTION_PHYSICAL_REFERENCE_INVALID',
        [...path, 'referencedCollection'],
        `Logical target Collection "${target.name}" does not map to referenced physical table "${constraint.referencedCollection.tableName}".`,
      ),
    );
    return undefined;
  }
  const referencedFields = resolveReferencedColumns(
    constraint.referencedColumns,
    target,
    [...path, 'referencedColumns'],
    issues,
  );
  if (
    !fields ||
    !referencedFields ||
    constraint.columns.length !== constraint.referencedColumns.length
  ) {
    return undefined;
  }

  return pruneUndefined({
    type: 'foreignKey' as const,
    name: constraint.name,
    fields,
    references: {
      collection: target.name,
      fields: referencedFields,
    },
    onDelete: resolveReferentialAction(constraint.onDelete),
    onUpdate: resolveReferentialAction(constraint.onUpdate),
    deferrable: resolveDeferrable(
      constraint.deferrable,
      constraint.initiallyDeferred,
    ),
  });
}

function resolveReferencedColumns(
  physicalNames: readonly string[],
  target: CollectionNamingIdentity,
  path: readonly (string | number)[],
  issues: CollectionResolutionIssue[],
): string[] | undefined {
  const strategy = new DefaultNamingStrategy(target.naming);
  const fields: string[] = [];
  let valid = true;
  for (const [index, physicalName] of physicalNames.entries()) {
    const name = reverseIdentifier(physicalName, target.naming.underscored);
    if (!name || strategy.fieldToColumnName(name) !== physicalName) {
      issues.push(
        issue(
          'COLLECTION_PHYSICAL_REFERENCE_INVALID',
          [...path, index],
          `Referenced physical column "${physicalName}" cannot be mapped with target Collection "${target.name}" naming.`,
        ),
      );
      valid = false;
    } else {
      fields.push(name);
    }
  }
  return valid ? fields : undefined;
}

function resolveIndexes(
  input: CollectionResolutionInput,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];
  for (const [index, physical] of input.physical.indexes.entries()) {
    if (physical.backsConstraint) continue;
    const resolved = resolveIndex(physical, index, columns, issues);
    if (resolved) indexes.push(resolved);
  }
  return indexes;
}

function resolveIndex(
  physical: PhysicalIndexSchema,
  index: number,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): IndexDefinition | undefined {
  const path = ['physical', 'indexes', index] as const;
  const keys: ResolvedIndexKey[] = [];
  const fields: string[] = [];
  const expressions: string[] = [];
  const order: Record<string, 'asc' | 'desc'> = {};
  let valid = true;

  for (const [keyIndex, key] of physical.keys.entries()) {
    const resolved = resolveIndexKey(
      key,
      [...path, 'keys', keyIndex],
      columns,
      issues,
    );
    if (!resolved) {
      valid = false;
      continue;
    }
    keys.push(resolved);
    if (resolved.field) {
      fields.push(resolved.field);
      if (resolved.order) setRecordEntry(order, resolved.field, resolved.order);
    } else if (resolved.expression) {
      expressions.push(resolved.expression);
    }
  }

  const includeFields = resolveLocalColumns(
    physical.includeColumns ?? [],
    [...path, 'includeColumns'],
    columns,
    issues,
  );
  if (!includeFields) valid = false;
  if (!valid) return undefined;

  return pruneUndefined({
    name: physical.name,
    fields: fields.length > 0 ? fields : undefined,
    expressions: expressions.length > 0 ? expressions : undefined,
    type: physical.method,
    order: Object.keys(order).length > 0 ? order : undefined,
    db: pruneUndefined({
      unique: physical.unique,
      keys,
      includeFields:
        includeFields && includeFields.length > 0 ? includeFields : undefined,
      predicate: physical.predicate,
    }),
  });
}

function resolveIndexKey(
  key: PhysicalIndexKey,
  path: readonly (string | number)[],
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): ResolvedIndexKey | undefined {
  if (key.columnName) {
    const field = columns.logicalNameByPhysicalName.get(key.columnName);
    if (!field) {
      issues.push(
        issue(
          'COLLECTION_PHYSICAL_REFERENCE_INVALID',
          [...path, 'columnName'],
          `Index references unknown physical column "${key.columnName}".`,
        ),
      );
      return undefined;
    }
    return pruneUndefined({ field, order: key.order, nulls: key.nulls });
  }
  return pruneUndefined({
    expression: key.expression,
    order: key.order,
    nulls: key.nulls,
  });
}

function resolveRelations(
  metadata: Record<string, RelationMetadata> | undefined,
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): RelationFieldDefinition[] {
  if (!metadata) return [];
  const relations: RelationFieldDefinition[] = [];
  for (const [name, relation] of Object.entries(metadata)) {
    const path = ['metadata', 'relations', name] as const;
    if (columns.byLogicalName.has(name)) {
      issues.push(
        issue(
          'COLLECTION_FIELD_CONFLICT',
          path,
          `Relation "${name}" conflicts with a physical Field of the same name.`,
        ),
      );
      continue;
    }
    if (relation.sourceKey && !columns.byLogicalName.has(relation.sourceKey)) {
      issues.push(
        issue(
          'COLLECTION_RELATION_INVALID',
          [...path, 'sourceKey'],
          `Relation sourceKey "${relation.sourceKey}" does not reference a local physical Field.`,
        ),
      );
    }

    const foreignKey = relation.foreignKey;
    if (relation.type === 'belongsTo') {
      if (foreignKey) {
        if (!columns.byLogicalName.has(foreignKey)) {
          issues.push(
            issue(
              'COLLECTION_RELATION_INVALID',
              [...path, 'foreignKey'],
              `belongsTo foreignKey "${foreignKey}" does not reference a local physical Field.`,
            ),
          );
        }
      } else {
        issues.push(
          issue(
            'COLLECTION_RELATION_INVALID',
            [...path, 'foreignKey'],
            `belongsTo relation "${name}" requires an explicit foreignKey.`,
          ),
        );
      }
    }

    relations.push(
      pruneUndefined({
        name,
        type: relation.type,
        target: relation.target,
        sourceKey: relation.sourceKey,
        targetKey: relation.targetKey,
        foreignKey,
        otherKey: relation.otherKey,
        through: relation.through,
        title: relation.title,
        description: relation.description,
      }),
    );
  }
  return relations;
}

function resolveView(
  input: CollectionResolutionInput,
  issues: CollectionResolutionIssue[],
): CollectionDefinition['view'] | undefined {
  if (
    input.physical.kind !== 'view' &&
    input.physical.kind !== 'materializedView'
  ) {
    return undefined;
  }
  if (input.physical.inspection.aspects.viewDefinition !== 'complete') {
    return undefined;
  }
  if (input.physical.viewDefinition === undefined) {
    issues.push(
      issue(
        'COLLECTION_SCHEMA_INCOMPLETE',
        ['physical', 'viewDefinition'],
        'A completely inspected View must include its physical definition.',
      ),
    );
    return undefined;
  }
  return { asRaw: { sql: input.physical.viewDefinition } };
}

function resolveWarnings(
  input: CollectionResolutionInput,
): CollectionResolutionWarning[] {
  const warnings: CollectionResolutionWarning[] = [];
  for (const aspect of INSPECTION_ASPECTS) {
    const status = input.physical.inspection.aspects[aspect];
    if (status === 'complete') continue;
    warnings.push({
      code:
        status === 'partial'
          ? 'COLLECTION_INSPECTION_PARTIAL'
          : 'COLLECTION_INSPECTION_UNSUPPORTED',
      aspect,
      path: ['inspection', 'aspects', aspect],
      message: `Physical Schema aspect "${aspect}" is ${status}.`,
    });
  }
  for (const warning of input.physical.inspection.warnings) {
    warnings.push({
      code: 'COLLECTION_INSPECTION_WARNING',
      sourceCode: warning.code,
      aspect: warning.aspect,
      message: warning.message,
    });
  }
  return warnings;
}

function resolveLocalColumns(
  physicalNames: readonly string[],
  path: readonly (string | number)[],
  columns: ResolvedColumns,
  issues: CollectionResolutionIssue[],
): string[] | undefined {
  const fields: string[] = [];
  let valid = true;
  for (const [index, physicalName] of physicalNames.entries()) {
    const name = columns.logicalNameByPhysicalName.get(physicalName);
    if (!name) {
      issues.push(
        issue(
          'COLLECTION_PHYSICAL_REFERENCE_INVALID',
          [...path, index],
          `Physical object references unknown local column "${physicalName}".`,
        ),
      );
      valid = false;
    } else {
      fields.push(name);
    }
  }
  return valid ? fields : undefined;
}

function reverseIdentifier(
  physicalName: string,
  underscored: boolean,
): string | undefined {
  if (physicalName.length === 0) return undefined;
  return underscored
    ? physicalName.replace(/_([a-z])/g, (_match: string, character: string) =>
        character.toUpperCase(),
      )
    : physicalName;
}

function resolveCollectionKind(kind: PhysicalCollectionKind): CollectionKind {
  switch (kind) {
    case 'view':
      return 'view';
    case 'materializedView':
      return 'materializedView';
    case 'table':
    case 'partitionedTable':
    case 'foreignTable':
      return 'table';
  }
}

function resolveReferentialAction(
  action: PhysicalReferentialAction | undefined,
): ReferentialAction | undefined {
  switch (action) {
    case undefined:
      return undefined;
    case 'cascade':
    case 'restrict':
      return action;
    case 'setNull':
      return 'set null';
    case 'setDefault':
      return 'set default';
    case 'noAction':
      return 'no action';
  }
}

function resolveDeferrable(
  deferrable: boolean | undefined,
  initiallyDeferred: boolean | undefined,
): Deferrable | undefined {
  if (deferrable === undefined) return undefined;
  if (!deferrable) return false;
  return initiallyDeferred ? 'deferred' : 'immediate';
}

function issue(
  code: CollectionResolutionIssueCode,
  path: readonly (string | number)[],
  message: string,
): CollectionResolutionIssue {
  return { code, path, message };
}

function pruneUndefined<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

function setRecordEntry<T>(
  record: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
