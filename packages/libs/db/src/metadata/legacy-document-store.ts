import { createHash } from 'node:crypto';
import type { NamingOptions } from '../collection/types.js';
import type {
  CollectionMetadataDocumentStore,
  CollectionMetadataPage,
  CollectionMetadataStoreCapabilities,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from './document-store.js';
import { CollectionMetadataStoreReadOnlyError } from './document-store-errors.js';
import {
  cloneStoredCollectionMetadata,
  paginateCollectionMetadata,
  validateCollectionMetadataStoreName,
} from './document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from './document.js';
import {
  extractLegacyCollectionMetadata,
  type LegacyMetadataExtractionDiagnostic,
} from './legacy-extraction.js';
import type { CollectionMetadataStore } from './store.js';

export interface LegacyCollectionMetadataDocumentStoreOptions {
  readonly naming?: NamingOptions;
  readonly onDiagnostic?: (
    diagnostic: LegacyMetadataExtractionDiagnostic,
  ) => void;
}

export class LegacyCollectionMetadataTransitionError extends Error {
  readonly code = 'LEGACY_METADATA_TRANSITION_FAILED' as const;

  constructor(
    readonly collection: string,
    readonly diagnostics: readonly LegacyMetadataExtractionDiagnostic[],
  ) {
    super(`Legacy Collection metadata transition failed for "${collection}".`);
    this.name = 'LegacyCollectionMetadataTransitionError';
  }
}

export class LegacyCollectionMetadataDocumentStore implements CollectionMetadataDocumentStore {
  readonly capabilities: CollectionMetadataStoreCapabilities = Object.freeze({
    writable: false,
    optimisticConcurrency: false,
  });

  constructor(
    private readonly legacy: CollectionMetadataStore,
    private readonly options: LegacyCollectionMetadataDocumentStoreOptions = {},
  ) {}

  async initialize(): Promise<void> {}

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    validateCollectionMetadataStoreName(name);
    const definition = await this.legacy.getCollection(name);
    if (!definition) return undefined;
    return cloneStoredCollectionMetadata(
      this.extract(name, { ...definition, name }),
    );
  }

  async list(
    options: ListCollectionMetadataOptions = {},
  ): Promise<CollectionMetadataPage> {
    const definitions = await this.legacy.listCollections();
    const stored = definitions.map((definition, index) => {
      const name = definition.name;
      if (!name) {
        throw new LegacyCollectionMetadataTransitionError(`#${index}`, [
          {
            severity: 'error',
            code: 'LEGACY_METADATA_INVALID',
            path: ['name'],
            message: 'Legacy Collection definition has no name.',
          },
        ]);
      }
      return this.extract(name, definition);
    });
    return paginateCollectionMetadata(stored, options);
  }

  async put(
    _document: CollectionMetadataDocument,
    _options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata> {
    throw new CollectionMetadataStoreReadOnlyError('put');
  }

  async delete(
    _name: string,
    _options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    throw new CollectionMetadataStoreReadOnlyError('delete');
  }

  private extract(name: string, definition: unknown): StoredCollectionMetadata {
    const result = extractLegacyCollectionMetadata(definition, {
      naming: this.options.naming,
    });
    for (const diagnostic of result.diagnostics) {
      this.options.onDiagnostic?.(diagnostic);
    }
    if (!result.document) {
      throw new LegacyCollectionMetadataTransitionError(
        name,
        result.diagnostics,
      );
    }
    return {
      document: result.document,
      revision: legacyRevision(definition),
    };
  }
}

function legacyRevision(value: unknown): string {
  const serialized = JSON.stringify(value);
  return `legacy-${createHash('sha256').update(serialized).digest('base64url')}`;
}
