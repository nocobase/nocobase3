// Map built-in dynamic text without changing server labels or stored errors.
// Unknown text keeps its original fallback.
const messageKeys = new Map<string, string>([
  ['Pages', 'pages'],
  ['All pages', 'allPages'],
  ['Home', 'home'],
  ['Authorization settings', 'authorizationSettings'],
  ['Database collections', 'databaseCollections'],
  ['Complete every permission before saving.', 'incompletePermissions'],
  ['Delete', 'delete'],
  ['Assignments', 'assignments'],
  ['Resource', 'resourceLabel'],
  ['All signed-in users', 'allSignedInUsers'],
  ['Complete the rule before saving.', 'incompleteRule'],
  ['Access', 'accessLabel'],
  ['Rule details', 'ruleDetails'],
  ['Name and resource.', 'ruleDetailsSummary'],
  ['Shared access', 'sharedAccess'],
  ['Actions and records.', 'sharedAccessSummary'],
  ['Audience and users.', 'audienceSummary'],
  ['Restrictions', 'restrictions'],
  ['Actions and allowed scope.', 'restrictionsSummary'],
  ['Select at least one action.', 'actionRequired'],
  ['Select a collection.', 'collectionRequired'],
  ['Configure action scopes.', 'actionScopesRequired'],
  ['Authorization request failed.', 'requestFailed'],
  ['Specific user', 'specificUser'],
  [
    'Applies to every user with a valid signed-in session.',
    'signedInAudienceHint',
  ],
  ['Select', 'select'],
  ['Read', 'read'],
  ['Create', 'create'],
  ['Update', 'update'],
  ['All Records', 'allRecordsLabel'],
  ['Own Records', 'ownRecords'],
  ['Custom Filter', 'customFilter'],
  ['In', 'in'],
]);

export function messageKey(message: string): string {
  return messageKeys.get(message) ?? message;
}
