import type {
  CollectionDefinition,
  CollectionMetadataPatch,
  FieldMetadataPatch,
} from '../collection/types.js';

export class CollectionMetadataFieldNotFoundError extends Error {
  readonly code = 'COLLECTION_METADATA_FIELD_NOT_FOUND' as const;

  constructor(
    readonly collection: string,
    readonly field: string,
  ) {
    super(
      `Collection metadata for "${collection}" does not contain field "${field}".`,
    );
    this.name = 'CollectionMetadataFieldNotFoundError';
  }
}

export interface CollectionMetadataStore {
  getCollection(name: string): Promise<CollectionDefinition | undefined>;
  listCollections(): Promise<CollectionDefinition[]>;
  saveCollection(name: string, definition: CollectionDefinition): Promise<void>;
  removeCollection(name: string): Promise<void>;
  renameCollection(
    from: string,
    to: string,
    definition: CollectionDefinition,
  ): Promise<void>;
  patchCollection(name: string, patch: CollectionMetadataPatch): Promise<void>;
  patchField(
    collection: string,
    field: string,
    patch: FieldMetadataPatch,
  ): Promise<void>;
}
