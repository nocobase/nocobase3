import type { NamingOptions } from '../collection/types.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from './document.js';

export interface CollectionMetadataStoreCapabilities {
  readonly writable: boolean;
  readonly optimisticConcurrency: boolean;
}

export interface ListCollectionMetadataOptions {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CollectionMetadataSummary {
  readonly name: string;
  readonly revision: string | number;
  readonly naming?: NamingOptions;
  readonly title?: string;
  readonly description?: string;
}

export interface CollectionMetadataPage {
  readonly items: readonly CollectionMetadataSummary[];
  readonly nextCursor?: string;
}

export interface PutCollectionMetadataOptions {
  readonly expectedRevision: string | number | null;
}

export interface DeleteCollectionMetadataOptions {
  readonly expectedRevision: string | number;
}

/**
 * The versioned supplemental-document Store contract. It has a transitional
 * name until the legacy full-Collection Store is removed.
 */
export interface CollectionMetadataDocumentStore {
  readonly capabilities: CollectionMetadataStoreCapabilities;

  initialize(): Promise<void>;
  get(name: string): Promise<StoredCollectionMetadata | undefined>;
  list(
    options?: ListCollectionMetadataOptions,
  ): Promise<CollectionMetadataPage>;
  put(
    document: CollectionMetadataDocument,
    options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata>;
  delete(name: string, options: DeleteCollectionMetadataOptions): Promise<void>;
}
