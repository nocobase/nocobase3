import type { CollectionMetadataDocument } from '../../metadata/document.js';
import type { PhysicalCollectionSchema } from '../../schema/inspector/types.js';
import type {
  CollectionResolutionResult,
  CollectionResolutionWarning,
} from '../resolver/types.js';
import {
  COLLECTION_ARTIFACT_FORMAT_VERSION,
  type CollectionArtifactCollectionFile,
  type CollectionArtifactFileKind,
  type CollectionArtifactManifest,
  type CollectionArtifactMetadataFile,
  type CollectionArtifactSchemaFile,
} from './format.js';
import { stableJson } from './stable-json.js';

/**
 * Everything one Collection's artifact is built from. `resolution` and
 * `physical` come from `connection.collections.getResolution()` and
 * `getPhysical()`; `metadata` is the stored document from
 * `connection.collectionMetadata.get()`, absent when the store holds none.
 */
export interface CollectionArtifactInput {
  readonly name: string;
  readonly resolution: CollectionResolutionResult;
  readonly physical: PhysicalCollectionSchema;
  readonly metadata?: CollectionMetadataDocument;
}

/** Serialized file contents, keyed by file kind; see `COLLECTION_ARTIFACT_FILE_NAMES` for the names. */
export type CollectionArtifactFiles = Readonly<
  Record<CollectionArtifactFileKind, string>
>;

export function serializeCollectionArtifact(
  input: CollectionArtifactInput,
): CollectionArtifactFiles {
  const collection: CollectionArtifactCollectionFile = {
    formatVersion: COLLECTION_ARTIFACT_FORMAT_VERSION,
    name: input.name,
    collection: input.resolution.collection,
    warnings: sortWarnings(input.resolution.warnings),
  };
  const metadata: CollectionArtifactMetadataFile = {
    formatVersion: COLLECTION_ARTIFACT_FORMAT_VERSION,
    name: input.name,
    document: input.metadata ?? null,
  };
  const schema: CollectionArtifactSchemaFile = {
    formatVersion: COLLECTION_ARTIFACT_FORMAT_VERSION,
    name: input.name,
    physical: input.physical,
  };
  return {
    collection: stableJson(collection),
    metadata: stableJson(metadata),
    schema: stableJson(schema),
  };
}

export interface CollectionArtifactManifestInput {
  readonly connection: string;
  readonly dialect: string;
  readonly migrationHead: string | null;
  readonly collections: readonly string[];
}

export function serializeCollectionArtifactManifest(
  input: CollectionArtifactManifestInput,
): string {
  const manifest: CollectionArtifactManifest = {
    formatVersion: COLLECTION_ARTIFACT_FORMAT_VERSION,
    connection: input.connection,
    dialect: input.dialect,
    migrationHead: input.migrationHead,
    collections: [...input.collections].sort(),
  };
  return stableJson(manifest);
}

/**
 * Warnings are a set: the resolver reports them in the order it happened to
 * visit fields, which is not part of their meaning. Field, index and relation
 * arrays inside the definition are left alone — their order is.
 */
function sortWarnings(
  warnings: readonly CollectionResolutionWarning[],
): CollectionResolutionWarning[] {
  return [...warnings].sort((a, b) => {
    const left = warningSortKey(a);
    const right = warningSortKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function warningSortKey(warning: CollectionResolutionWarning): string {
  return [
    warning.code,
    warning.path?.join('.') ?? '',
    warning.aspect ?? '',
    warning.message,
  ].join('\x00');
}
