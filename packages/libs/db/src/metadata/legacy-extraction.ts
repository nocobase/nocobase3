import type { NamingOptions, RelationType } from '../collection/types.js';
import { DefaultNamingStrategy } from '../naming/index.js';
import type {
  CollectionMetadataDocument,
  FieldMetadata,
  RelationMetadata,
} from './document.js';
import { CollectionMetadataValidationError } from './errors.js';
import { validateCollectionMetadataDocument } from './validation.js';

export type LegacyMetadataExtractionDiagnosticCode =
  | 'LEGACY_METADATA_INVALID'
  | 'LEGACY_METADATA_PROPERTY_REMOVED'
  | 'LEGACY_METADATA_VIRTUAL_FIELD_UNSUPPORTED'
  | 'LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE';

export interface LegacyMetadataExtractionDiagnostic {
  severity: 'warning' | 'error';
  code: LegacyMetadataExtractionDiagnosticCode;
  path: readonly (string | number)[];
  message: string;
}

export interface LegacyMetadataExtractionResult {
  document?: CollectionMetadataDocument;
  diagnostics: readonly LegacyMetadataExtractionDiagnostic[];
}

export interface LegacyMetadataExtractionOptions {
  naming?: NamingOptions;
}

const RELATION_TYPES = new Set<RelationType>([
  'belongsTo',
  'hasOne',
  'hasMany',
  'belongsToMany',
]);
const RELATION_PROPERTIES = [
  'target',
  'sourceKey',
  'targetKey',
  'foreignKey',
  'foreignKeyType',
  'otherKey',
  'through',
  'constraints',
  'onDelete',
  'onUpdate',
] as const;

export function extractLegacyCollectionMetadata(
  input: unknown,
  options: LegacyMetadataExtractionOptions = {},
): LegacyMetadataExtractionResult {
  const diagnostics: LegacyMetadataExtractionDiagnostic[] = [];
  if (!isPlainObject(input)) {
    return {
      diagnostics: [
        diagnostic(
          'error',
          'LEGACY_METADATA_INVALID',
          [],
          'Legacy collection definition must be a plain object.',
        ),
      ],
    };
  }

  const name = readLegacyName(input.name, ['name'], diagnostics);
  const naming = readLegacyNaming(input.naming, ['naming'], diagnostics);
  const effectiveNaming = { ...options.naming, ...naming };
  const namingStrategy = new DefaultNamingStrategy(effectiveNaming);

  warnRemovedProperty(input, 'writable', [], diagnostics);
  validateLegacyTableName(input, name, namingStrategy, diagnostics);

  const fields: Record<string, FieldMetadata> = {};
  const relations: Record<string, RelationMetadata> = {};
  const seenNames = new Set<string>();
  if (input.fields !== undefined && !Array.isArray(input.fields)) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        ['fields'],
        'Legacy collection fields must be an array.',
      ),
    );
  } else {
    for (const [index, rawField] of (input.fields ?? []).entries()) {
      extractLegacyField(
        rawField,
        index,
        namingStrategy,
        fields,
        relations,
        seenNames,
        diagnostics,
      );
    }
  }

  if (diagnostics.some((item) => item.severity === 'error') || !name) {
    return { diagnostics };
  }

  const candidate = pruneUndefined({
    version: 1 as const,
    name,
    naming,
    title: readLegacyOptionalString(input, 'title', [], diagnostics),
    description: readLegacyOptionalString(
      input,
      'description',
      [],
      diagnostics,
    ),
    fields: Object.keys(fields).length > 0 ? fields : undefined,
    relations: Object.keys(relations).length > 0 ? relations : undefined,
  });

  try {
    const document = validateCollectionMetadataDocument(candidate);
    if (diagnostics.some((item) => item.severity === 'error')) {
      return { diagnostics };
    }
    return { document, diagnostics };
  } catch (error) {
    if (!(error instanceof CollectionMetadataValidationError)) {
      throw error;
    }
    diagnostics.push(
      ...error.issues.map((item) =>
        diagnostic('error', 'LEGACY_METADATA_INVALID', item.path, item.message),
      ),
    );
    return { diagnostics };
  }
}

function extractLegacyField(
  input: unknown,
  index: number,
  naming: DefaultNamingStrategy,
  fields: Record<string, FieldMetadata>,
  relations: Record<string, RelationMetadata>,
  seenNames: Set<string>,
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): void {
  const path = ['fields', index] as const;
  if (!isPlainObject(input)) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        path,
        'Legacy field definition must be a plain object.',
      ),
    );
    return;
  }
  const name = readLegacyName(input.name, [...path, 'name'], diagnostics);
  warnRemovedProperty(input, 'interface', path, diagnostics);
  warnRemovedProperty(input, 'uiSchema', path, diagnostics);
  if (!name) return;

  if (seenNames.has(name)) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        [...path, 'name'],
        `Legacy field name "${name}" is declared more than once.`,
      ),
    );
    return;
  }
  seenNames.add(name);
  validateLegacyColumnName(input, name, naming, path, diagnostics);

  if (input.type === 'virtual') {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_VIRTUAL_FIELD_UNSUPPORTED',
        path,
        `Virtual field "${name}" cannot be represented by Collection Metadata V1.`,
      ),
    );
    return;
  }

  if (isRelationType(input.type)) {
    const target = readLegacyName(
      input.target,
      [...path, 'target'],
      diagnostics,
    );
    if (!target) return;
    setRecordEntry(
      relations,
      name,
      pruneUndefined({
        type: input.type,
        target,
        sourceKey: readLegacyNameIfPresent(
          input,
          'sourceKey',
          path,
          diagnostics,
        ),
        targetKey: readLegacyNameIfPresent(
          input,
          'targetKey',
          path,
          diagnostics,
        ),
        foreignKey: readLegacyNameIfPresent(
          input,
          'foreignKey',
          path,
          diagnostics,
        ),
        otherKey: readLegacyNameIfPresent(input, 'otherKey', path, diagnostics),
        through: readLegacyNameIfPresent(input, 'through', path, diagnostics),
        title: readLegacyOptionalString(input, 'title', path, diagnostics),
        description: readLegacyOptionalString(
          input,
          'description',
          path,
          diagnostics,
        ),
      }),
    );
    return;
  }

  if (RELATION_PROPERTIES.some((property) => input[property] !== undefined)) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        [...path, 'type'],
        `Field "${name}" has relation properties but an invalid relation type.`,
      ),
    );
    return;
  }

  const metadata = pruneUndefined({
    title: readLegacyOptionalString(input, 'title', path, diagnostics),
    description: readLegacyOptionalString(
      input,
      'description',
      path,
      diagnostics,
    ),
  });
  if (Object.keys(metadata).length > 0) {
    setRecordEntry(fields, name, metadata);
  }
}

function readLegacyNaming(
  input: unknown,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): NamingOptions | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        path,
        'Legacy naming must be a plain object.',
      ),
    );
    return undefined;
  }
  const naming: NamingOptions = {};
  if (input.underscored !== undefined) {
    if (typeof input.underscored === 'boolean') {
      naming.underscored = input.underscored;
    } else {
      diagnostics.push(
        diagnostic(
          'error',
          'LEGACY_METADATA_INVALID',
          [...path, 'underscored'],
          'Legacy naming.underscored must be a boolean.',
        ),
      );
    }
  }
  if (input.tablePrefix !== undefined) {
    if (typeof input.tablePrefix === 'string') {
      naming.tablePrefix = input.tablePrefix;
    } else {
      diagnostics.push(
        diagnostic(
          'error',
          'LEGACY_METADATA_INVALID',
          [...path, 'tablePrefix'],
          'Legacy naming.tablePrefix must be a string.',
        ),
      );
    }
  }
  return naming;
}

function validateLegacyTableName(
  input: Record<string, unknown>,
  name: string | undefined,
  naming: DefaultNamingStrategy,
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): void {
  if (input.tableName === undefined || !name) return;
  const expected = naming.collectionToTableName(name);
  if (input.tableName !== expected) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE',
        ['tableName'],
        `Legacy tableName must equal the deterministic name "${expected}" before it can be removed.`,
      ),
    );
  }
}

function validateLegacyColumnName(
  input: Record<string, unknown>,
  name: string,
  naming: DefaultNamingStrategy,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): void {
  if (input.columnName === undefined) return;
  const expected = naming.fieldToColumnName(name);
  if (input.columnName !== expected) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE',
        [...path, 'columnName'],
        `Legacy columnName must equal the deterministic name "${expected}" before it can be removed.`,
      ),
    );
  }
}

function warnRemovedProperty(
  input: Record<string, unknown>,
  key: string,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): void {
  if (Object.hasOwn(input, key)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'LEGACY_METADATA_PROPERTY_REMOVED',
        [...path, key],
        `Legacy property "${key}" is not part of Collection Metadata V1 and was not extracted.`,
      ),
    );
  }
}

function readLegacyNameIfPresent(
  input: Record<string, unknown>,
  key: string,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): string | undefined {
  return input[key] === undefined
    ? undefined
    : readLegacyName(input[key], [...path, key], diagnostics);
}

function readLegacyName(
  input: unknown,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): string | undefined {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.trim() !== input
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        path,
        'Expected a non-empty string without surrounding whitespace.',
      ),
    );
    return undefined;
  }
  return input;
}

function readLegacyOptionalString(
  input: Record<string, unknown>,
  key: string,
  path: readonly (string | number)[],
  diagnostics: LegacyMetadataExtractionDiagnostic[],
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    diagnostics.push(
      diagnostic(
        'error',
        'LEGACY_METADATA_INVALID',
        [...path, key],
        `Legacy ${key} must be a string.`,
      ),
    );
    return undefined;
  }
  return value;
}

function diagnostic(
  severity: LegacyMetadataExtractionDiagnostic['severity'],
  code: LegacyMetadataExtractionDiagnosticCode,
  path: readonly (string | number)[],
  message: string,
): LegacyMetadataExtractionDiagnostic {
  return { severity, code, path, message };
}

function isRelationType(input: unknown): input is RelationType {
  return typeof input === 'string' && RELATION_TYPES.has(input as RelationType);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function pruneUndefined<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) {
      delete value[key];
    }
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
