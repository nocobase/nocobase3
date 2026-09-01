import type { NamingOptions } from '../collection/types.js';
import { CollectionMetadataConflictError } from './document-store-errors.js';
import type { CollectionMetadataDocumentStore } from './document-store.js';
import type { CollectionMetadataStoreCapabilities } from './document-store.js';
import type {
  CollectionMetadataDocument,
  RelationMetadata,
  StoredCollectionMetadata,
} from './document.js';
import type { CollectionMetadataIssue } from './errors.js';
import { CollectionMetadataPatchError } from './service-errors.js';
import { validateCollectionMetadataDocument } from './validation.js';

export interface CollectionMetadataPropertiesPatch {
  readonly naming?: NamingOptions | null;
  readonly title?: string | null;
  readonly description?: string | null;
}

export interface CollectionFieldMetadataPatch {
  readonly title?: string | null;
  readonly description?: string | null;
}

export interface UpdateCollectionMetadataOptions {
  readonly expectedRevision?: string | number | null;
}

export interface CollectionMetadataValidationContext {
  readonly previous?: CollectionMetadataDocument;
  readonly operation:
    | 'updateCollection'
    | 'updateField'
    | 'setRelation'
    | 'removeRelation'
    | 'replaceDocument'
    | 'removeField';
}

export interface CollectionMetadataDocumentValidator {
  validate(
    document: CollectionMetadataDocument,
    context: CollectionMetadataValidationContext,
  ): Promise<void>;
}

export interface CollectionMetadataInvalidation {
  readonly collections: readonly string[];
  readonly namingIndex: boolean;
}

export interface CollectionMetadataInvalidator {
  invalidate(change: CollectionMetadataInvalidation): void;
  invalidateAll(): void;
}

export interface CollectionMetadataServiceOptions {
  readonly store: CollectionMetadataDocumentStore;
  readonly validator: CollectionMetadataDocumentValidator;
  readonly invalidator: CollectionMetadataInvalidator;
  readonly onInvalidationError: (error: unknown) => void;
}

export class CollectionMetadataService {
  private initializationPromise?: Promise<void>;

  constructor(private readonly options: CollectionMetadataServiceOptions) {}

  get capabilities(): CollectionMetadataStoreCapabilities {
    return this.options.store.capabilities;
  }

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    await this.initialize();
    return this.options.store.get(name);
  }

  async replaceDocument(
    input: CollectionMetadataDocument,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata | undefined> {
    const document = validateCollectionMetadataDocument(input);
    const current = await this.readCurrent(document.name, options);
    const previous = current.stored?.document;
    if (
      sameDocument(document, previous ?? { version: 1, name: document.name })
    ) {
      return current.stored;
    }
    await this.options.validator.validate(document, {
      previous,
      operation: 'replaceDocument',
    });
    let stored: StoredCollectionMetadata | undefined;
    if (isEmptyDocument(document)) {
      if (current.stored) {
        await this.options.store.delete(document.name, {
          expectedRevision: current.stored.revision,
        });
      }
    } else {
      stored = await this.options.store.put(document, {
        expectedRevision: current.stored?.revision ?? null,
      });
    }
    this.invalidate(documentInvalidation(document.name, previous, document));
    return stored;
  }

  async removeDocument(
    name: string,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<void> {
    const current = await this.readCurrent(name, options);
    if (!current.stored) return;
    await this.options.store.delete(name, {
      expectedRevision: current.stored.revision,
    });
    this.invalidate(documentInvalidation(name, current.stored.document));
  }

  async updateCollection(
    name: string,
    patch: CollectionMetadataPropertiesPatch,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata | undefined> {
    validatePatch(patch, ['naming', 'title', 'description']);
    if (patch.naming !== undefined && patch.naming !== null) {
      validateNamingPatch(patch.naming);
    }
    const naming =
      patch.naming && Object.keys(patch.naming).length === 0
        ? null
        : patch.naming;
    validateNullableString(patch.title, 'title');
    validateNullableString(patch.description, 'description');
    return this.mutate(
      name,
      'updateCollection',
      options,
      (document) => {
        applyNullableProperty(document, 'naming', naming);
        applyNullableProperty(document, 'title', patch.title);
        applyNullableProperty(document, 'description', patch.description);
      },
      { collections: [name], namingIndex: patch.naming !== undefined },
    );
  }

  async updateField(
    collection: string,
    field: string,
    patch: CollectionFieldMetadataPatch,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata | undefined> {
    validateName(field, 'field');
    validatePatch(patch, ['title', 'description']);
    validateNullableString(patch.title, 'title');
    validateNullableString(patch.description, 'description');
    return this.mutate(
      collection,
      'updateField',
      options,
      (document) => {
        const fields = cloneRecord(document.fields);
        const metadata = { ...(getRecordEntry(fields, field) ?? {}) };
        applyNullableProperty(metadata, 'title', patch.title);
        applyNullableProperty(metadata, 'description', patch.description);
        if (Object.keys(metadata).length === 0) delete fields[field];
        else setRecordEntry(fields, field, metadata);
        document.fields = Object.keys(fields).length > 0 ? fields : undefined;
      },
      { collections: [collection], namingIndex: false },
    );
  }

  async setRelation(
    collection: string,
    name: string,
    relation: RelationMetadata,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata> {
    validateName(name, 'relation');
    const current = await this.readCurrent(collection, options);
    const previous = getRecordEntry(current.stored?.document.relations, name);
    const stored = await this.mutateCurrent(
      collection,
      'setRelation',
      current,
      (document) => {
        const relations = cloneRecord(document.relations);
        setRecordEntry(relations, name, { ...relation });
        document.relations = relations;
      },
      {
        collections: unique([
          collection,
          ...(previous ? relationCollections(previous) : []),
          ...relationCollections(relation),
        ]),
        namingIndex: false,
      },
    );
    if (!stored) throw new Error('setRelation unexpectedly removed metadata.');
    return stored;
  }

  async removeRelation(
    collection: string,
    name: string,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata | undefined> {
    validateName(name, 'relation');
    const current = await this.readCurrent(collection, options);
    const existing = getRecordEntry(current.stored?.document.relations, name);
    return this.mutateCurrent(
      collection,
      'removeRelation',
      current,
      (document) => {
        const relations = cloneRecord(document.relations);
        delete relations[name];
        document.relations =
          Object.keys(relations).length > 0 ? relations : undefined;
      },
      {
        collections: unique([
          collection,
          ...(existing ? relationCollections(existing) : []),
        ]),
        namingIndex: false,
      },
    );
  }

  async removeField(
    collection: string,
    field: string,
    options: UpdateCollectionMetadataOptions = {},
  ): Promise<StoredCollectionMetadata | undefined> {
    validateName(field, 'field');
    const current = await this.readCurrent(collection, options);
    const hasField = Boolean(
      current.stored?.document.fields &&
      Object.hasOwn(current.stored.document.fields, field),
    );
    const hasRelation = Boolean(
      current.stored?.document.relations &&
      Object.hasOwn(current.stored.document.relations, field),
    );
    if (!hasField && !hasRelation) return current.stored;
    const previousRelation = getRecordEntry(
      current.stored?.document.relations,
      field,
    );
    return this.mutateCurrent(
      collection,
      'removeField',
      current,
      (document) => {
        const fields = cloneRecord(document.fields);
        const relations = cloneRecord(document.relations);
        delete fields[field];
        delete relations[field];
        document.fields = Object.keys(fields).length > 0 ? fields : undefined;
        document.relations =
          Object.keys(relations).length > 0 ? relations : undefined;
      },
      {
        collections: unique([
          collection,
          ...(previousRelation ? relationCollections(previousRelation) : []),
        ]),
        namingIndex: false,
      },
    );
  }

  private async mutate(
    name: string,
    operation: CollectionMetadataValidationContext['operation'],
    options: UpdateCollectionMetadataOptions,
    apply: (document: MutableCollectionMetadataDocument) => void,
    invalidation: CollectionMetadataInvalidation,
  ): Promise<StoredCollectionMetadata | undefined> {
    const current = await this.readCurrent(name, options);
    return this.mutateCurrent(name, operation, current, apply, invalidation);
  }

  private async mutateCurrent(
    name: string,
    operation: CollectionMetadataValidationContext['operation'],
    current: CurrentMetadata,
    apply: (document: MutableCollectionMetadataDocument) => void,
    invalidation: CollectionMetadataInvalidation,
  ): Promise<StoredCollectionMetadata | undefined> {
    const document = mutableDocument(
      current.stored?.document ?? { version: 1, name },
    );
    apply(document);
    const normalized = validateCollectionMetadataDocument(document);
    if (
      sameDocument(normalized, current.stored?.document ?? { version: 1, name })
    ) {
      return current.stored;
    }
    await this.options.validator.validate(normalized, {
      previous: current.stored?.document,
      operation,
    });

    let stored: StoredCollectionMetadata | undefined;
    if (isEmptyDocument(normalized)) {
      if (current.stored) {
        await this.options.store.delete(name, {
          expectedRevision: current.stored.revision,
        });
      }
    } else {
      stored = await this.options.store.put(normalized, {
        expectedRevision: current.stored?.revision ?? null,
      });
    }
    this.invalidate(invalidation);
    return stored;
  }

  private async readCurrent(
    name: string,
    options: UpdateCollectionMetadataOptions,
  ): Promise<CurrentMetadata> {
    await this.initialize();
    validateName(name, 'collection');
    validateUpdateOptions(options);
    const stored = await this.options.store.get(name);
    const actual = stored?.revision ?? null;
    if (
      Object.hasOwn(options, 'expectedRevision') &&
      options.expectedRevision !== actual
    ) {
      throw new CollectionMetadataConflictError(
        name,
        options.expectedRevision ?? null,
        actual,
      );
    }
    return { stored };
  }

  private invalidate(change: CollectionMetadataInvalidation): void {
    try {
      this.options.invalidator.invalidate(change);
    } catch (error) {
      try {
        this.options.invalidator.invalidateAll();
      } catch (fallbackError) {
        this.options.onInvalidationError(fallbackError);
      }
      this.options.onInvalidationError(error);
    }
  }

  private async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      const initializing = this.options.store.initialize();
      this.initializationPromise = initializing.catch((error: unknown) => {
        this.initializationPromise = undefined;
        throw error;
      });
    }
    await this.initializationPromise;
  }
}

interface CurrentMetadata {
  readonly stored?: StoredCollectionMetadata;
}

type MutableCollectionMetadataDocument = {
  -readonly [
    Key in keyof CollectionMetadataDocument
  ]: CollectionMetadataDocument[Key];
};

function mutableDocument(
  document: CollectionMetadataDocument,
): MutableCollectionMetadataDocument {
  return structuredClone(document);
}

function validatePatch(value: unknown, allowed: readonly string[]): void {
  if (!isPlainObject(value)) patchIssue([], 'Expected a plain patch object.');
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    patchIssue([unknown[0]], `Unknown patch property "${unknown[0]}".`);
  }
}

function validateNamingPatch(value: NamingOptions): void {
  validatePatch(value, ['underscored', 'tablePrefix']);
  if (
    value.underscored !== undefined &&
    typeof value.underscored !== 'boolean'
  ) {
    patchIssue(['naming', 'underscored'], 'Expected a boolean.');
  }
  if (
    value.tablePrefix !== undefined &&
    typeof value.tablePrefix !== 'string'
  ) {
    patchIssue(['naming', 'tablePrefix'], 'Expected a string.');
  }
}

function validateNullableString(
  value: string | null | undefined,
  property: string,
): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    patchIssue([property], 'Expected a string or null.');
  }
}

function validateUpdateOptions(options: UpdateCollectionMetadataOptions): void {
  if (!isPlainObject(options))
    patchIssue([], 'Expected a plain options object.');
  const unknown = Object.keys(options).filter(
    (key) => key !== 'expectedRevision',
  );
  if (unknown.length > 0) patchIssue([unknown[0]], 'Unknown option.');
  if (Object.hasOwn(options, 'expectedRevision')) {
    const revision = options.expectedRevision;
    if (
      revision !== null &&
      !(typeof revision === 'string' && revision.length > 0) &&
      !(typeof revision === 'number' && Number.isFinite(revision))
    ) {
      patchIssue(['expectedRevision'], 'Expected a revision or null.');
    }
  }
}

function validateName(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    patchIssue([label], `Expected a valid ${label} name.`);
  }
}

function patchIssue(
  path: readonly (string | number)[],
  message: string,
): never {
  const issues: CollectionMetadataIssue[] = [
    { code: 'COLLECTION_METADATA_TYPE_INVALID', path, message },
  ];
  throw new CollectionMetadataPatchError(issues);
}

function applyNullableProperty<T extends object, Key extends keyof T>(
  target: T,
  key: Key,
  value: T[Key] | null | undefined,
): void {
  if (value === undefined) return;
  if (value === null) delete target[key];
  else target[key] = value;
}

function cloneRecord<T>(
  input: Record<string, T> | undefined,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    setRecordEntry(result, key, structuredClone(value));
  }
  return result;
}

function getRecordEntry<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

function relationCollections(relation: RelationMetadata): string[] {
  return unique(
    [relation.target, relation.through].filter(
      (value): value is string => value !== undefined,
    ),
  );
}

function documentInvalidation(
  name: string,
  previous?: CollectionMetadataDocument,
  next?: CollectionMetadataDocument,
): CollectionMetadataInvalidation {
  const relations = [
    ...Object.values(previous?.relations ?? {}),
    ...Object.values(next?.relations ?? {}),
  ];
  return {
    collections: unique([
      name,
      ...relations.flatMap((relation) => relationCollections(relation)),
    ]),
    namingIndex:
      JSON.stringify(previous?.naming) !== JSON.stringify(next?.naming),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isEmptyDocument(document: CollectionMetadataDocument): boolean {
  return Object.keys(document).every(
    (key) => key === 'version' || key === 'name',
  );
}

function sameDocument(
  left: CollectionMetadataDocument,
  right: CollectionMetadataDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
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
