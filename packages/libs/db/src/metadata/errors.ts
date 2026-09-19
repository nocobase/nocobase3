export type CollectionMetadataIssueCode =
  | 'COLLECTION_METADATA_VERSION_UNSUPPORTED'
  | 'COLLECTION_METADATA_REQUIRED'
  | 'COLLECTION_METADATA_TYPE_INVALID'
  | 'COLLECTION_METADATA_UNKNOWN_PROPERTY'
  | 'COLLECTION_METADATA_NAME_INVALID'
  | 'COLLECTION_METADATA_NAME_CONFLICT'
  | 'COLLECTION_METADATA_OPTIMISTIC_LOCK_INVALID'
  | 'COLLECTION_METADATA_RELATION_INVALID';

export interface CollectionMetadataIssue {
  code: CollectionMetadataIssueCode;
  path: readonly (string | number)[];
  message: string;
}

export class CollectionMetadataValidationError extends Error {
  readonly code = 'COLLECTION_METADATA_INVALID' as const;

  constructor(readonly issues: readonly CollectionMetadataIssue[]) {
    super(formatCollectionMetadataIssues(issues));
    this.name = 'CollectionMetadataValidationError';
  }
}

function formatCollectionMetadataIssues(
  issues: readonly CollectionMetadataIssue[],
): string {
  if (issues.length === 0) {
    return 'Collection metadata is invalid.';
  }
  return `Collection metadata is invalid: ${issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join('; ')}`;
}

function formatIssuePath(path: readonly (string | number)[]): string {
  return path.length === 0 ? '$' : `$.${path.join('.')}`;
}
