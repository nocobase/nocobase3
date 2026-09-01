import type {
  CollectionMetadataStore,
  CollectionMetadataPage,
  CollectionMetadataStoreCapabilities,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from './document-store.js';
import { CollectionMetadataConflictError } from './document-store-errors.js';
import {
  cloneStoredCollectionMetadata,
  paginateCollectionMetadata,
  validateCollectionMetadataStoreName,
  validateDeleteCollectionMetadataOptions,
  validatePutCollectionMetadataOptions,
} from './document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from './document.js';
import { validateCollectionMetadataDocument } from './validation.js';

export class InMemoryCollectionMetadataStore implements CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities = Object.freeze({
    writable: true,
    optimisticConcurrency: true,
  });

  private readonly documents = new Map<string, StoredCollectionMetadata>();
  private revision = 0;

  async initialize(): Promise<void> {}

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    validateCollectionMetadataStoreName(name);
    const stored = this.documents.get(name);
    return stored ? cloneStoredCollectionMetadata(stored) : undefined;
  }

  async list(
    options: ListCollectionMetadataOptions = {},
  ): Promise<CollectionMetadataPage> {
    return paginateCollectionMetadata([...this.documents.values()], options);
  }

  async put(
    input: CollectionMetadataDocument,
    options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata> {
    validatePutCollectionMetadataOptions(options);
    const document = validateCollectionMetadataDocument(input);
    const current = this.documents.get(document.name);
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== options.expectedRevision) {
      throw new CollectionMetadataConflictError(
        document.name,
        options.expectedRevision,
        actualRevision,
      );
    }

    const stored: StoredCollectionMetadata = {
      document,
      revision: this.nextRevision(),
    };
    this.documents.set(document.name, stored);
    return cloneStoredCollectionMetadata(stored);
  }

  async delete(
    name: string,
    options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    validateCollectionMetadataStoreName(name);
    validateDeleteCollectionMetadataOptions(options);
    const current = this.documents.get(name);
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== options.expectedRevision) {
      throw new CollectionMetadataConflictError(
        name,
        options.expectedRevision,
        actualRevision,
      );
    }
    this.documents.delete(name);
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }
}
