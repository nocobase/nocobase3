export type CollectionResolutionIssueCode =
  | 'COLLECTION_SCHEMA_INCOMPLETE'
  | 'COLLECTION_SCHEMA_DRIFT'
  | 'COLLECTION_NAME_CONFLICT'
  | 'COLLECTION_FIELD_CONFLICT'
  | 'COLLECTION_OPTIMISTIC_LOCK_INVALID'
  | 'COLLECTION_PHYSICAL_REFERENCE_INVALID'
  | 'COLLECTION_RELATION_INVALID';

export interface CollectionResolutionIssue {
  readonly code: CollectionResolutionIssueCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class CollectionResolutionError extends Error {
  readonly code = 'COLLECTION_RESOLUTION_FAILED' as const;

  constructor(readonly issues: readonly CollectionResolutionIssue[]) {
    super(formatCollectionResolutionIssues(issues));
    this.name = 'CollectionResolutionError';
  }
}

function formatCollectionResolutionIssues(
  issues: readonly CollectionResolutionIssue[],
): string {
  if (issues.length === 0) {
    return 'Collection resolution failed.';
  }
  return `Collection resolution failed: ${issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join('; ')}`;
}

function formatIssuePath(path: readonly (string | number)[]): string {
  return path.length === 0 ? '$' : `$.${path.join('.')}`;
}
