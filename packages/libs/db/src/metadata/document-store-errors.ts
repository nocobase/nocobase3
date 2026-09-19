export type CollectionMetadataStoreErrorCode =
  | 'METADATA_CONFLICT'
  | 'METADATA_STORE_READ_ONLY'
  | 'METADATA_STORE_INVALID_OPTIONS'
  | 'METADATA_STORE_INVALID_CURSOR'
  | 'LEGACY_METADATA_TRANSITION_FAILED';

export class CollectionMetadataConflictError extends Error {
  readonly code = 'METADATA_CONFLICT' as const;

  constructor(
    readonly collection: string,
    readonly expectedRevision: string | number | null,
    readonly actualRevision: string | number | null,
  ) {
    super(
      `Collection metadata revision conflict for "${collection}": expected ${formatRevision(expectedRevision)}, received ${formatRevision(actualRevision)}.`,
    );
    this.name = 'CollectionMetadataConflictError';
  }
}

export class CollectionMetadataStoreReadOnlyError extends Error {
  readonly code = 'METADATA_STORE_READ_ONLY' as const;

  constructor(
    readonly operation: 'put' | 'delete',
    readonly source?: string,
  ) {
    super(
      source
        ? `Collection Metadata Store is read-only; edit source "${source}" instead of calling ${operation}().`
        : `Collection Metadata Store is read-only and cannot ${operation}.`,
    );
    this.name = 'CollectionMetadataStoreReadOnlyError';
  }
}

export class CollectionMetadataStoreOptionsError extends Error {
  readonly code = 'METADATA_STORE_INVALID_OPTIONS' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CollectionMetadataStoreOptionsError';
  }
}

export class CollectionMetadataStoreCursorError extends Error {
  readonly code = 'METADATA_STORE_INVALID_CURSOR' as const;

  constructor() {
    super('Collection Metadata Store cursor is invalid.');
    this.name = 'CollectionMetadataStoreCursorError';
  }
}

function formatRevision(revision: string | number | null): string {
  return revision === null ? 'no document' : `revision ${String(revision)}`;
}
