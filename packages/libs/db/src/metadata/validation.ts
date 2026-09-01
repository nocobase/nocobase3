import type {
  CollectionMetadataDocument,
  FieldMetadata,
  RelationMetadata,
} from './document.js';
import {
  CollectionMetadataValidationError,
  type CollectionMetadataIssue,
  type CollectionMetadataIssueCode,
} from './errors.js';

const ROOT_KEYS = new Set([
  'version',
  'name',
  'naming',
  'title',
  'description',
  'fields',
  'relations',
]);
const NAMING_KEYS = new Set(['underscored', 'tablePrefix']);
const FIELD_KEYS = new Set(['title', 'description']);
const RELATION_KEYS = new Set([
  'type',
  'target',
  'sourceKey',
  'targetKey',
  'foreignKey',
  'otherKey',
  'through',
  'title',
  'description',
]);
const RELATION_TYPES = new Set([
  'belongsTo',
  'hasOne',
  'hasMany',
  'belongsToMany',
]);

export function validateCollectionMetadataDocument(
  input: unknown,
): CollectionMetadataDocument {
  const issues: CollectionMetadataIssue[] = [];
  if (!isPlainObject(input)) {
    throw new CollectionMetadataValidationError([
      issue('COLLECTION_METADATA_TYPE_INVALID', [], 'Expected a plain object.'),
    ]);
  }

  checkUnknownProperties(input, ROOT_KEYS, [], issues);
  if (input.version === undefined) {
    issues.push(
      issue(
        'COLLECTION_METADATA_REQUIRED',
        ['version'],
        'version is required.',
      ),
    );
  } else if (input.version !== 1) {
    issues.push(
      issue(
        'COLLECTION_METADATA_VERSION_UNSUPPORTED',
        ['version'],
        'Only metadata document version 1 is supported.',
      ),
    );
  }
  const name = readName(input, 'name', [], issues, true);
  const title = readOptionalString(input, 'title', [], issues);
  const description = readOptionalString(input, 'description', [], issues);
  const naming = readNaming(input.naming, ['naming'], issues);
  const fields = readFields(input.fields, ['fields'], issues);
  const relations = readRelations(input.relations, ['relations'], issues);

  if (fields && relations) {
    for (const field of Object.keys(fields)) {
      if (Object.hasOwn(relations, field)) {
        issues.push(
          issue(
            'COLLECTION_METADATA_NAME_CONFLICT',
            ['relations', field],
            `Metadata name "${field}" is used by both a field and a relation.`,
          ),
        );
      }
    }
  }

  if (issues.length > 0 || !name) {
    throw new CollectionMetadataValidationError(issues);
  }

  return pruneUndefined({
    version: 1,
    name,
    naming,
    title,
    description,
    fields,
    relations,
  });
}

function readNaming(
  input: unknown,
  path: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): CollectionMetadataDocument['naming'] | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        path,
        'Expected naming to be a plain object.',
      ),
    );
    return undefined;
  }
  checkUnknownProperties(input, NAMING_KEYS, path, issues);
  const underscored = readOptionalBoolean(input, 'underscored', path, issues);
  const tablePrefix = readOptionalString(input, 'tablePrefix', path, issues);
  return pruneUndefined({ underscored, tablePrefix });
}

function readFields(
  input: unknown,
  path: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): Record<string, FieldMetadata> | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        path,
        'Expected fields to be a plain object.',
      ),
    );
    return undefined;
  }
  const fields: Record<string, FieldMetadata> = {};
  for (const [name, value] of Object.entries(input)) {
    const fieldPath = [...path, name];
    if (!validName(name)) {
      issues.push(
        issue(
          'COLLECTION_METADATA_NAME_INVALID',
          fieldPath,
          'Field metadata name must be a non-empty string without surrounding whitespace.',
        ),
      );
    }
    if (!isPlainObject(value)) {
      issues.push(
        issue(
          'COLLECTION_METADATA_TYPE_INVALID',
          fieldPath,
          'Expected field metadata to be a plain object.',
        ),
      );
      continue;
    }
    checkUnknownProperties(value, FIELD_KEYS, fieldPath, issues);
    setRecordEntry(
      fields,
      name,
      pruneUndefined({
        title: readOptionalString(value, 'title', fieldPath, issues),
        description: readOptionalString(
          value,
          'description',
          fieldPath,
          issues,
        ),
      }),
    );
  }
  return fields;
}

function readRelations(
  input: unknown,
  path: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): Record<string, RelationMetadata> | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        path,
        'Expected relations to be a plain object.',
      ),
    );
    return undefined;
  }
  const relations: Record<string, RelationMetadata> = {};
  for (const [name, value] of Object.entries(input)) {
    const relationPath = [...path, name];
    if (!validName(name)) {
      issues.push(
        issue(
          'COLLECTION_METADATA_NAME_INVALID',
          relationPath,
          'Relation metadata name must be a non-empty string without surrounding whitespace.',
        ),
      );
    }
    if (!isPlainObject(value)) {
      issues.push(
        issue(
          'COLLECTION_METADATA_TYPE_INVALID',
          relationPath,
          'Expected relation metadata to be a plain object.',
        ),
      );
      continue;
    }
    checkUnknownProperties(value, RELATION_KEYS, relationPath, issues);
    const type = readRelationType(
      value.type,
      [...relationPath, 'type'],
      issues,
    );
    const target = readName(value, 'target', relationPath, issues, true);
    const relation: Partial<RelationMetadata> = {
      type,
      target,
      sourceKey: readName(value, 'sourceKey', relationPath, issues),
      targetKey: readName(value, 'targetKey', relationPath, issues),
      foreignKey: readName(value, 'foreignKey', relationPath, issues),
      otherKey: readName(value, 'otherKey', relationPath, issues),
      through: readName(value, 'through', relationPath, issues),
      title: readOptionalString(value, 'title', relationPath, issues),
      description: readOptionalString(
        value,
        'description',
        relationPath,
        issues,
      ),
    };
    if (type && target) {
      setRecordEntry(
        relations,
        name,
        pruneUndefined(relation) as RelationMetadata,
      );
    }
  }
  return relations;
}

function readRelationType(
  input: unknown,
  path: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): RelationMetadata['type'] | undefined {
  if (typeof input !== 'string' || !RELATION_TYPES.has(input)) {
    issues.push(
      issue(
        'COLLECTION_METADATA_RELATION_INVALID',
        path,
        'Expected belongsTo, hasOne, hasMany, or belongsToMany.',
      ),
    );
    return undefined;
  }
  return input as RelationMetadata['type'];
}

function readName(
  input: Record<string, unknown>,
  key: string,
  parentPath: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
  required: boolean = false,
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    if (required) {
      issues.push(
        issue(
          'COLLECTION_METADATA_REQUIRED',
          [...parentPath, key],
          `${key} is required.`,
        ),
      );
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        [...parentPath, key],
        `Expected ${key} to be a string.`,
      ),
    );
    return undefined;
  }
  if (!validName(value)) {
    issues.push(
      issue(
        'COLLECTION_METADATA_NAME_INVALID',
        [...parentPath, key],
        `${key} must be non-empty and have no surrounding whitespace.`,
      ),
    );
    return undefined;
  }
  return value;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: string,
  parentPath: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        [...parentPath, key],
        `Expected ${key} to be a string.`,
      ),
    );
    return undefined;
  }
  return value;
}

function readOptionalBoolean(
  input: Record<string, unknown>,
  key: string,
  parentPath: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    issues.push(
      issue(
        'COLLECTION_METADATA_TYPE_INVALID',
        [...parentPath, key],
        `Expected ${key} to be a boolean.`,
      ),
    );
    return undefined;
  }
  return value;
}

function checkUnknownProperties(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[],
  issues: CollectionMetadataIssue[],
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      issues.push(
        issue(
          'COLLECTION_METADATA_UNKNOWN_PROPERTY',
          [...path, key],
          `Unknown property "${key}".`,
        ),
      );
    }
  }
}

function issue(
  code: CollectionMetadataIssueCode,
  path: readonly (string | number)[],
  message: string,
): CollectionMetadataIssue {
  return { code, path, message };
}

function validName(value: string): boolean {
  return value.length > 0 && value.trim() === value;
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
