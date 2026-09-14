import type { CollectionMetadataDocument } from '../../metadata/document.js';
import type { PhysicalCollectionSchema } from '../../schema/inspector/types.js';
import type { CollectionResolutionWarning } from '../resolver/types.js';
import type { CollectionDefinition } from '../types.js';

/**
 * Version of the on-disk Collection artifact format. Bump it when the shape of
 * any artifact file changes in a way a reader has to know about; the types it
 * embeds (`CollectionDefinition`, `PhysicalCollectionSchema`,
 * `CollectionMetadataDocument`) are still evolving.
 */
export const COLLECTION_ARTIFACT_FORMAT_VERSION = 1 as const;

export type CollectionArtifactFormatVersion =
  typeof COLLECTION_ARTIFACT_FORMAT_VERSION;

/** The three files written for every Collection, keyed by what each one holds. */
export type CollectionArtifactFileKind = 'collection' | 'metadata' | 'schema';

export const COLLECTION_ARTIFACT_FILE_NAMES: Readonly<
  Record<CollectionArtifactFileKind, string>
> = Object.freeze({
  collection: 'collection.json',
  metadata: 'metadata.json',
  schema: 'schema.json',
});

/** Connection-level manifest; the underscore keeps it apart from Collection directories. */
export const COLLECTION_ARTIFACT_MANIFEST_FILE_NAME = '_manifest.json';

/** `collection.json`: the resolved logical view plus the warnings resolution raised. */
export interface CollectionArtifactCollectionFile {
  readonly formatVersion: CollectionArtifactFormatVersion;
  readonly name: string;
  readonly collection: CollectionDefinition;
  readonly warnings: readonly CollectionResolutionWarning[];
}

/** `metadata.json`: the stored supplemental document, or `null` when the store holds none. */
export interface CollectionArtifactMetadataFile {
  readonly formatVersion: CollectionArtifactFormatVersion;
  readonly name: string;
  readonly document: CollectionMetadataDocument | null;
}

/** `schema.json`: what the Schema Inspector reported for the backing physical object. */
export interface CollectionArtifactSchemaFile {
  readonly formatVersion: CollectionArtifactFormatVersion;
  readonly name: string;
  readonly physical: PhysicalCollectionSchema;
}

/**
 * `_manifest.json`: which database state a connection's artifacts were read
 * from. Deliberately carries nothing that changes between two generations of
 * the same state — no timestamp, host, or generator identity — so regenerating
 * produces byte-identical output.
 */
export interface CollectionArtifactManifest {
  readonly formatVersion: CollectionArtifactFormatVersion;
  readonly connection: string;
  readonly dialect: string;
  /** Name of the last applied migration, or `null` when the connection has no history table. */
  readonly migrationHead: string | null;
  readonly collections: readonly string[];
}
