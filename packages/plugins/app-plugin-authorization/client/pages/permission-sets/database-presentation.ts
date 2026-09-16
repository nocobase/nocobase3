import { defaultDatabaseActionDraft, recordAccessKey } from './drafts.js';
import { DatabaseActionDetails } from './database-grant-details.js';
import { recordsAndFieldsSummary, type GrantMark } from './labels.js';
import { registerResourceTypePresentation } from './resource-presentation.js';
import type { GrantDraft } from './types.js';

/** The resource type whose grants carry record access and field selections. */
const COLLECTION_TYPE = 'database.collection';

/**
 * What a grant on a Collection reaches. An action is unrestricted only when every
 * applicable record and field dimension is unrestricted.
 */
function collectionMark(grant: GrantDraft, action: string): GrantMark {
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  const records =
    action === 'create' || recordAccessKey(value.recordAccess) === 'allRecords';
  const input = !['create', 'update'].includes(action) || value.input === '*';
  const output =
    !['create', 'read', 'update'].includes(action) || value.output === '*';
  return records && input && output ? 'all' : 'scoped';
}

registerResourceTypePresentation(COLLECTION_TYPE, {
  summary: recordsAndFieldsSummary,
  mark: collectionMark,
  actionDetails: DatabaseActionDetails,
});
