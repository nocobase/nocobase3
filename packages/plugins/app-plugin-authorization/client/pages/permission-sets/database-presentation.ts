import { defaultDatabaseActionDraft, recordAccessKey } from './drafts.js';
import { DatabaseActionDetails } from './database-grant-details.js';
import { recordsAndFieldsSummary, type GrantMark } from './labels.js';
import { registerResourceTypePresentation } from './resource-presentation.js';
import type { GrantDraft } from './types.js';

/** The resource type whose grants carry record access and field selections. */
const COLLECTION_TYPE = 'database.collection';

/**
 * What a grant on a Collection reaches. A create selects no records, so it is
 * never scoped; everything else is scoped unless its policy takes every record.
 */
function collectionMark(grant: GrantDraft, action: string): GrantMark {
  if (action === 'create') return 'all';
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  return recordAccessKey(value.recordAccess) === 'allRecords'
    ? 'all'
    : 'scoped';
}

registerResourceTypePresentation(COLLECTION_TYPE, {
  summary: recordsAndFieldsSummary,
  mark: collectionMark,
  actionDetails: DatabaseActionDetails,
});
