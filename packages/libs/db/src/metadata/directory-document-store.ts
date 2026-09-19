import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  COLLECTION_ARTIFACT_FILE_NAMES,
  COLLECTION_ARTIFACT_FORMAT_VERSION,
  type CollectionArtifactMetadataFile,
} from '../collection/artifact/format.js';
import { validateCollectionArtifactDirectoryName } from '../collection/artifact/names.js';
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
  contentRevision,
  paginateCollectionMetadata,
  validateCollectionMetadataStoreName,
} from './document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from './document.js';
import { validateCollectionMetadataDocument } from './validation.js';

export interface DirectoryCollectionMetadataStoreOptions {
  /**
   * A Collection artifact directory: `<directory>/<name>/metadata.json` per
   * Collection, in the format `serializeCollectionArtifact()` writes. Relative
   * paths resolve against the process working directory, so callers that know
   * an application root should resolve them first.
   */
  readonly directory: string;
}

/**
 * Reads supplemental Collection metadata from the `metadata.json` files of a
 * Collection artifact directory. The files are the source: for an external
 * connection nothing else can hold metadata, and the generator writes the
 * same format, so what it scaffolds is what this store reads back. Read-only,
 * like the Module store; the files are edited in the repository.
 */
export class DirectoryCollectionMetadataStore implements CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities = Object.freeze({
    writable: false,
    optimisticConcurrency: false,
  });

  readonly directory: string;
  private readonly documents = new Map<string, StoredCollectionMetadata>();
  private initialized = false;

  constructor(options: DirectoryCollectionMetadataStoreOptions) {
    if (
      typeof options?.directory !== 'string' ||
      options.directory.trim() === ''
    ) {
      throw new CollectionMetadataStoreOptionsError(
        'Directory Collection Metadata Store requires a directory.',
      );
    }
    this.directory = path.resolve(options.directory);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const next = new Map<string, StoredCollectionMetadata>();
    for (const [name, file] of this.metadataFiles()) {
      const document = readMetadataDocument(name, file);
      if (document === undefined) continue;
      next.set(name, { document, revision: contentRevision(document) });
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
    throw new CollectionMetadataStoreReadOnlyError('put', this.directory);
  }

  async delete(
    _name: string,
    _options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    throw new CollectionMetadataStoreReadOnlyError('delete', this.directory);
  }

  /** A missing directory is an empty store: the first generate run creates it. */
  private *metadataFiles(): Iterable<[name: string, file: string]> {
    if (!existsSync(this.directory)) return;
    const entries = readdirSync(this.directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          !entry.name.startsWith('_'),
      )
      .map((entry) => entry.name)
      .sort();
    for (const name of entries) {
      validateCollectionArtifactDirectoryName(name);
      const file = path.join(
        this.directory,
        name,
        COLLECTION_ARTIFACT_FILE_NAMES.metadata,
      );
      if (existsSync(file)) yield [name, file];
    }
  }
}

function readMetadataDocument(
  name: string,
  file: string,
): CollectionMetadataDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} must hold an object with formatVersion, name and document.`,
    );
  }
  const record = parsed as Partial<CollectionArtifactMetadataFile>;
  if (record.formatVersion !== COLLECTION_ARTIFACT_FORMAT_VERSION) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} has formatVersion ${JSON.stringify(record.formatVersion)}; this store reads formatVersion ${COLLECTION_ARTIFACT_FORMAT_VERSION}.`,
    );
  }
  if (record.name !== name) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} names Collection ${JSON.stringify(record.name)} but sits in directory "${name}".`,
    );
  }
  if (record.document === null || record.document === undefined) {
    return undefined;
  }
  const document = validateCollectionMetadataDocument(record.document);
  if (document.name !== name) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} holds a document for Collection "${document.name}" but sits in directory "${name}".`,
    );
  }
  return document;
}
