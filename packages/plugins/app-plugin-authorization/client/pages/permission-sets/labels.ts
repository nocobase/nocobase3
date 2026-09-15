import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSet,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import type { PermissionSetCapabilities } from '../../components/permission-set-access.js';
import type { UserDirectory } from '../../components/user-directory.js';
import { defaultDatabaseActionDraft, recordAccessKey } from './drafts.js';
import type {
  DatabaseActionDraft,
  Draft,
  FilterConditionDraft,
  GrantDraft,
  RecordAccessDraft,
} from './types.js';

/** How each filter operator is named, in the editor and wherever a stored condition is read back. */
export const filterOperatorLabels: Readonly<
  Record<FilterConditionDraft['operator'], string>
> = {
  $eq: 'Equals',
  $ne: 'Not equal',
  $in: 'In',
  $notIn: 'Not in',
  $gt: 'Greater than',
  $gte: 'At least',
  $lt: 'Less than',
  $lte: 'At most',
};

export function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resourceTypeLabel(
  options: AuthorizationOptions,
  type: string,
): string {
  return (
    options.resourceTypes.find((item) => item.value === type)?.label ??
    humanize(type)
  );
}

export function resourceLabel(
  options: AuthorizationOptions,
  resource: { type: string; id: string },
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === resource.type)
      ?.resources.find((item) => item.value === resource.id)?.label ??
    resource.id
  );
}

export function subjectLabel(
  subject: AuthorizationSubject,
  directory: UserDirectory,
): string {
  if (subject.type === 'authenticated') return 'All signed-in users';
  const user = directory.users.find((item) => item.id === subject.id);
  return user
    ? `${user.name} · ${user.username ?? user.email}`
    : `User ${subject.id}`;
}

export function describeSet(set: PermissionSet): string {
  return set.unrestricted === true
    ? 'Unrestricted access to everything in this application'
    : `${set.grants.length} configured resource${set.grants.length === 1 ? '' : 's'}`;
}

export function isSystemSet(set: PermissionSet): boolean {
  return set.unrestricted === true || set.protection !== undefined;
}

export function permissionCountFromDraft(draft: Draft): number {
  return draft.grants.reduce((sum, grant) => sum + grant.actions.length, 0);
}

export function detailBadgeTone(
  capabilities: PermissionSetCapabilities,
): 'neutral' | 'protected' {
  return capabilities.unrestricted || capabilities.protectedSet
    ? 'protected'
    : 'neutral';
}

export function detailBadgeLabel(
  capabilities: PermissionSetCapabilities,
): string {
  if (capabilities.unrestricted) return 'Unrestricted access';
  return capabilities.protectedSet ? 'Protected system set' : 'Custom';
}

export function detailSummary(
  draft: Draft,
  assignments: readonly PermissionSetAssignment[],
  unrestricted: boolean,
): string {
  const assignmentCount = `${assignments.length} ${assignments.length === 1 ? 'assignment' : 'assignments'}`;
  if (unrestricted) return `Key: ${draft.key} · ${assignmentCount}`;
  const categories = new Set(draft.grants.map((grant) => grant.resource.type));
  return `Key: ${draft.key} · ${permissionCountFromDraft(draft)} permissions · ${categories.size} resource ${categories.size === 1 ? 'type' : 'types'} · ${assignmentCount}`;
}

export function databaseAccessSummary(
  options: AuthorizationOptions,
  grant: GrantDraft,
): string {
  return grant.actions
    .map((action) => {
      const value = grant.database[action] ?? defaultDatabaseActionDraft();
      return `${humanize(action)}: ${action === 'create' ? 'new records' : recordAccessLabel(options, value.recordAccess)}`;
    })
    .join(', ');
}

/**
 * The records the granted actions start from, as one clause. A create selects
 * no records, so it is left out; actions that disagree say so once rather than
 * listing every one, because the side panel already carries the breakdown.
 */
export function recordsClause(
  options: AuthorizationOptions,
  grant: GrantDraft,
): string {
  const labels = grant.actions
    .filter((action) => action !== 'create')
    .map((action) =>
      recordAccessLabel(
        options,
        (grant.database[action] ?? defaultDatabaseActionDraft()).recordAccess,
      ),
    );
  if (labels.length === 0) return 'New records';
  return new Set(labels).size > 1 ? 'Mixed records' : labels[0];
}

/** The two clauses a collection row carries: its records, then its fields. */
export function recordsAndFieldsSummary(
  options: AuthorizationOptions,
  grant: GrantDraft,
): string {
  if (grant.actions.length === 0) return NONE;
  const values = grant.actions.map(
    (action) => grant.database[action] ?? defaultDatabaseActionDraft(),
  );
  const fields = values.every(
    (value) => value.input === '*' && value.output === '*',
  )
    ? 'all fields'
    : 'selected fields';
  return `${recordsClause(options, grant)}, ${fields}`;
}

export function databaseActionSummary(
  options: AuthorizationOptions,
  action: string,
  value: DatabaseActionDraft,
): string {
  const fields = actionFieldsSummary(action, value);
  return [
    ...(fields === NONE ? [] : [fields]),
    ...(action === 'create'
      ? []
      : [recordAccessLabel(options, value.recordAccess)]),
  ].join(' · ');
}

/** What the value stands for when an action has no fields or no records to name. */
const NONE = '—';

/** The field half of an action's summary: a delete names no fields at all. */
export function actionFieldsSummary(
  action: string,
  value: DatabaseActionDraft,
): string {
  const parts: string[] = [];
  if (action === 'create' || action === 'update')
    parts.push(`${fieldSelectionLabel(value.input)} writable`);
  if (action === 'create' || action === 'read' || action === 'update')
    parts.push(`${fieldSelectionLabel(value.output)} visible`);
  return parts.length === 0 ? NONE : parts.join(' · ');
}

/**
 * The records an action starts from, named as the options endpoint names the
 * policy. A create selects no records, so it starts from none.
 */
export function actionRecordsSummary(
  options: AuthorizationOptions,
  action: string,
  value: DatabaseActionDraft,
): string {
  return action === 'create'
    ? NONE
    : recordAccessLabel(options, value.recordAccess);
}

/** The policy as the options endpoint names it. */
export function recordAccessLabel(
  options: AuthorizationOptions,
  value: RecordAccessDraft,
): string {
  const key = recordAccessKey(value);
  return (
    options.recordAccessPolicies.find((policy) => policy.value === key)
      ?.label ?? humanize(key)
  );
}

export function databaseActionDescription(action: string): string {
  switch (action) {
    case 'create':
      return 'Choose fields that can be submitted and returned.';
    case 'read':
      return 'Choose visible fields and which records can be read.';
    case 'update':
      return 'Choose editable fields and which records can be updated.';
    case 'delete':
      return 'Choose which records can be deleted.';
    default:
      return 'Configure fields and record access for this action.';
  }
}

export function fieldSelectionLabel(value: '*' | readonly string[]): string {
  return value === '*' ? 'All fields' : `${value.length} fields`;
}

export function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return (
    options.collections.find((collection) => collection.name === name)
      ?.fields ?? []
  );
}
