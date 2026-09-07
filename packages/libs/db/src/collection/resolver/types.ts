import type { CollectionDefinition, NamingOptions } from '../types.js';
import type { CollectionMetadataDocument } from '../../metadata/document.js';
import type {
  PhysicalCollectionIdentity,
  PhysicalCollectionSchema,
  PhysicalSchemaAspect,
  PhysicalSchemaInspection,
} from '../../schema/inspector/types.js';

export interface CollectionNamingIdentity {
  readonly name: string;
  readonly naming: Required<NamingOptions>;
}

export interface CollectionResolutionContext {
  resolvePhysicalCollection(
    identity: PhysicalCollectionIdentity,
  ): CollectionNamingIdentity | undefined;
}

export interface CollectionResolutionInput {
  readonly physical: PhysicalCollectionSchema;
  readonly metadata?: CollectionMetadataDocument;
  readonly naming?: NamingOptions;
  readonly context: CollectionResolutionContext;
}

export type CollectionResolutionWarningCode =
  | 'COLLECTION_INSPECTION_WARNING'
  | 'COLLECTION_INSPECTION_PARTIAL'
  | 'COLLECTION_INSPECTION_UNSUPPORTED';

export interface CollectionResolutionWarning {
  readonly code: CollectionResolutionWarningCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly aspect?: PhysicalSchemaAspect;
  readonly sourceCode?: string;
}

export interface CollectionResolutionResult {
  readonly collection: CollectionDefinition;
  readonly inspection: PhysicalSchemaInspection;
  readonly warnings: readonly CollectionResolutionWarning[];
}
