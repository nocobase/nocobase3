import type {
  CollectionMetadataPage,
  CollectionMetadataSummary,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from './document-store.js';
import {
  CollectionMetadataStoreCursorError,
  CollectionMetadataStoreOptionsError,
} from './document-store-errors.js';
import type { StoredCollectionMetadata } from './document.js';
import { validateCollectionMetadataDocument } from './validation.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export function cloneStoredCollectionMetadata(
  stored: StoredCollectionMetadata,
): StoredCollectionMetadata {
  return {
    document: validateCollectionMetadataDocument(stored.document),
    revision: stored.revision,
  };
}

export function summarizeStoredCollectionMetadata(
  stored: StoredCollectionMetadata,
): CollectionMetadataSummary {
  const document = stored.document;
  return pruneUndefined({
    name: document.name,
    revision: stored.revision,
    naming: document.naming ? { ...document.naming } : undefined,
    title: document.title,
    description: document.description,
  });
}

export function paginateCollectionMetadata(
  stored: readonly StoredCollectionMetadata[],
  options: ListCollectionMetadataOptions = {},
): CollectionMetadataPage {
  validateOptionsObject(options, ['limit', 'cursor']);
  const limit = validateLimit(options.limit);
  const after = decodeCursor(options.cursor);
  const sorted = [...stored].sort((left, right) =>
    compareNames(left.document.name, right.document.name),
  );
  const eligible = after
    ? sorted.filter((item) => item.document.name > after)
    : sorted;
  const page = eligible.slice(0, limit + 1);
  const hasNext = page.length > limit;
  const items = page.slice(0, limit).map(summarizeStoredCollectionMetadata);
  return pruneUndefined({
    items,
    nextCursor:
      hasNext && items.length > 0
        ? encodeCursor(items[items.length - 1].name)
        : undefined,
  });
}

export function validatePutCollectionMetadataOptions(
  options: PutCollectionMetadataOptions,
): void {
  validateOptionsObject(options, ['expectedRevision']);
  if (
    !Object.hasOwn(options, 'expectedRevision') ||
    !validRevision(options.expectedRevision, true)
  ) {
    throw new CollectionMetadataStoreOptionsError(
      'Collection Metadata Store put() requires expectedRevision to be a string, finite number, or null.',
    );
  }
}

export function validateDeleteCollectionMetadataOptions(
  options: DeleteCollectionMetadataOptions,
): void {
  validateOptionsObject(options, ['expectedRevision']);
  if (
    !Object.hasOwn(options, 'expectedRevision') ||
    !validRevision(options.expectedRevision, false)
  ) {
    throw new CollectionMetadataStoreOptionsError(
      'Collection Metadata Store delete() requires expectedRevision to be a string or finite number.',
    );
  }
}

export function validateCollectionMetadataStoreName(name: string): void {
  if (typeof name !== 'string' || name.length === 0 || name.trim() !== name) {
    throw new CollectionMetadataStoreOptionsError(
      'Collection Metadata Store name must be a non-empty string without surrounding whitespace.',
    );
  }
}

function validateLimit(input: number | undefined): number {
  if (input === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(input) || input < 1 || input > MAX_LIMIT) {
    throw new CollectionMetadataStoreOptionsError(
      `Collection Metadata Store limit must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }
  return input;
}

function encodeCursor(name: string): string {
  return Buffer.from(JSON.stringify({ version: 1, after: name })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  if (typeof cursor !== 'string' || cursor.length === 0) {
    throw new CollectionMetadataStoreCursorError();
  }
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).version !== 1 ||
      typeof (value as Record<string, unknown>).after !== 'string' ||
      ((value as Record<string, unknown>).after as string).length === 0 ||
      ((value as Record<string, unknown>).after as string).trim() !==
        (value as Record<string, unknown>).after ||
      Object.keys(value).some((key) => key !== 'version' && key !== 'after')
    ) {
      throw new CollectionMetadataStoreCursorError();
    }
    return (value as Record<string, unknown>).after as string;
  } catch (error) {
    if (error instanceof CollectionMetadataStoreCursorError) throw error;
    throw new CollectionMetadataStoreCursorError();
  }
}

function validateOptionsObject(
  value: unknown,
  allowedKeys: readonly string[],
): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.keys(value).some((key) => !allowedKeys.includes(key))
  ) {
    throw new CollectionMetadataStoreOptionsError(
      'Collection Metadata Store options must be a plain object with only supported properties.',
    );
  }
}

function validRevision(value: unknown, allowNull: boolean): boolean {
  if (value === null) return allowNull;
  if (typeof value === 'string') return value.length > 0;
  return typeof value === 'number' && Number.isFinite(value);
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pruneUndefined<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}
