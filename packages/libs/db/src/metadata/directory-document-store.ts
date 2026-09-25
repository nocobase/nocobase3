import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { COLLECTION_ARTIFACT_FILE_NAMES } from '../collection/artifact/format.js';
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
   * A directory of hand-written metadata: one `<name>.json` per Collection,
   * holding that Collection's metadata document. Relative paths resolve
   * against the process working directory, so callers that know an application
   * root should resolve them first.
   */
  readonly directory: string;
}

/** The file suffix of one Collection's metadata document in a directory store. */
const COLLECTION_METADATA_FILE_EXTENSION = '.json';

/**
 * Reads supplemental Collection metadata from a directory of `<name>.json`
 * files, each one a Collection metadata document. The files are the source:
 * for an external connection nothing else can hold metadata, so they are
 * written by hand and committed. Read-only, like the Module store.
 *
 * This is deliberately a different layout from the Collection artifacts
 * `serializeCollectionArtifact()` writes, whose `<name>/metadata.json` is a
 * derived copy. A directory in that layout is refused rather than read, so a
 * store pointed at generated artifacts cannot mistake a snapshot for its
 * source.
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

  /** A missing directory is an empty store: nothing has been written yet. */
  private *metadataFiles(): Iterable<[name: string, file: string]> {
    if (!existsSync(this.directory)) return;
    const entries = readdirSync(this.directory, { withFileTypes: true })
      .filter(
        (entry) => !entry.name.startsWith('.') && !entry.name.startsWith('_'),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const file = path.join(this.directory, entry.name);
      if (entry.isDirectory()) {
        if (
          existsSync(path.join(file, COLLECTION_ARTIFACT_FILE_NAMES.metadata))
        ) {
          throw new CollectionMetadataStoreOptionsError(
            `${this.directory} holds ${entry.name}/${COLLECTION_ARTIFACT_FILE_NAMES.metadata}, the layout of generated Collection artifacts. A metadata directory holds one <name>${COLLECTION_METADATA_FILE_EXTENSION} per Collection containing only its metadata document: move the "document" of ${path.join(entry.name, COLLECTION_ARTIFACT_FILE_NAMES.metadata)} to ${entry.name}${COLLECTION_METADATA_FILE_EXTENSION}.`,
          );
        }
        continue;
      }
      if (
        !entry.isFile() ||
        !entry.name.endsWith(COLLECTION_METADATA_FILE_EXTENSION)
      ) {
        continue;
      }
      const name = entry.name.slice(
        0,
        -COLLECTION_METADATA_FILE_EXTENSION.length,
      );
      validateCollectionArtifactDirectoryName(name);
      yield [name, file];
    }
  }
}

function readMetadataDocument(
  name: string,
  file: string,
): CollectionMetadataDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const document = validateCollectionMetadataDocument(parsed);
  if (document.name !== name) {
    throw new CollectionMetadataStoreOptionsError(
      `${file} holds the metadata document of Collection "${document.name}"; rename the file or the document's name so they match.`,
    );
  }
  return document;
}
