import type { CollectionMetadataIssue } from './errors.js';

export class CollectionMetadataPatchError extends Error {
  readonly code = 'COLLECTION_METADATA_PATCH_INVALID' as const;

  constructor(readonly issues: readonly CollectionMetadataIssue[]) {
    super('Collection metadata patch is invalid.');
    this.name = 'CollectionMetadataPatchError';
  }
}
