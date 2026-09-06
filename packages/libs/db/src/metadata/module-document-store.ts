import { createHash } from 'node:crypto';
import type {
  CollectionMetadataStore,
  CollectionMetadataPage,
  CollectionMetadataStoreCapabilities,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from './document-store.js';
import {
  CollectionMetadataStoreOptionsError,
  CollectionMetadataStoreReadOnlyError,
} from './document-store-errors.js';
import {
  cloneStoredCollectionMetadata,
  paginateCollectionMetadata,
  validateCollectionMetadataStoreName,
} from './document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from './document.js';
import { validateCollectionMetadataDocument } from './validation.js';

export interface ModuleCollectionMetadataStoreOptions {
  readonly documents: readonly unknown[];
  readonly source?: string;
}

export class ModuleCollectionMetadataStore implements CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities = Object.freeze({
    writable: false,
    optimisticConcurrency: false,
  });

  private readonly documents = new Map<string, StoredCollectionMetadata>();
  private initialized = false;

  constructor(private readonly options: ModuleCollectionMetadataStoreOptions) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const next = new Map<string, StoredCollectionMetadata>();
    for (const input of this.options.documents) {
      const document = validateCollectionMetadataDocument(input);
      if (next.has(document.name)) {
        throw new CollectionMetadataStoreOptionsError(
          `Module Collection Metadata contains duplicate document "${document.name}".`,
        );
      }
      next.set(document.name, {
        document,
        revision: contentRevision(document),
      });
    }
    this.documents.clear();
    for (const [name, stored] of next) this.documents.set(name, stored);
    this.initialized = true;
  }

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    await this.initialize();
    validateCollectionMetadataStoreName(name);
    const stored = this.documents.get(name);
    return stored ? cloneStoredCollectionMetadata(stored) : undefined;
  }

  async list(
    options: ListCollectionMetadataOptions = {},
  ): Promise<CollectionMetadataPage> {
    await this.initialize();
    return paginateCollectionMetadata([...this.documents.values()], options);
  }

  async put(
    _document: CollectionMetadataDocument,
    _options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata> {
    throw new CollectionMetadataStoreReadOnlyError('put', this.options.source);
  }

  async delete(
    _name: string,
    _options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    throw new CollectionMetadataStoreReadOnlyError(
      'delete',
      this.options.source,
    );
  }
}

function contentRevision(document: CollectionMetadataDocument): string {
  return `sha256-${createHash('sha256')
    .update(canonicalJson(document))
    .digest('base64url')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
