import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSet,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import type { PermissionSetCapabilities } from '../../components/permission-set-access.js';
import type { UserDirectory } from '../../components/user-directory.js';
import type { Translate } from '../../i18n.js';
import { defaultDatabaseActionDraft, recordAccessKey } from './drafts.js';
import { resourceTypePresentation } from './resource-presentation.js';
import type {
  DatabaseActionDraft,
  Draft,
  FilterConditionDraft,
  GrantDraft,
  RecordAccessDraft,
} from './types.js';

/**
 * What one action on one resource reaches: every record, some of them, or
 * nothing. A set conferring unrestricted access has no grants to read, so it
 * carries its own mark rather than reading as "not granted".
 */
export type GrantMark = 'all' | 'scoped' | 'none' | 'bypass';

export function markLabel(t: Translate, mark: GrantMark): string {
  return t(`marks.labels.${mark}`);
}

/** What the mark means, for a tooltip and for the legend. */
export function markDescription(t: Translate, mark: GrantMark): string {
  return t(`marks.descriptions.${mark}`);
}

/**
 * What one action on one resource reaches. A type that narrows its grants says
 * so through its own presentation; anything else reaches the whole resource.
 */
export function actionMark(grant: GrantDraft, action: string): GrantMark {
  if (!grant.actions.includes(action)) return 'none';
  return (
    resourceTypePresentation(grant.resource.type)?.mark?.(grant, action) ??
    'all'
  );
}

/** The operators the editor offers, in the order it offers them. */
export const filterOperators: readonly FilterConditionDraft['operator'][] = [
  '$eq',
  '$ne',
  '$in',
  '$notIn',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
];

/** How one filter operator is named, in the editor and wherever a stored condition is read back. */
export function filterOperatorLabel(
  t: Translate,
  operator: FilterConditionDraft['operator'],
): string {
  return t(`filterOperators.${operator}`);
}

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

/** How one action is named: as its resource type declares it, else humanised. */
export function actionLabel(
  options: AuthorizationOptions,
  type: string,
  action: string,
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === type)
      ?.actions.find((item) => item.value === action)?.label ?? humanize(action)
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
  t: Translate,
  subject: AuthorizationSubject,
  directory: UserDirectory,
): string {
  if (subject.type === 'authenticated') return t('common.signedInUsers');
  const user = directory.users.find((item) => item.id === subject.id);
  return user
    ? `${user.name} · ${user.username ?? user.email}`
    : t('common.userFallback', { id: subject.id });
}

export function describeSet(t: Translate, set: PermissionSet): string {
  return set.unrestricted === true
    ? t('permissionSets.describeUnrestricted')
    : t(countKey('permissionSets.configuredResources', set.grants.length), {
        count: set.grants.length,
      });
}

/**
 * The singular or plural key for a count. i18next plural suffixes are avoided
 * so both catalogues declare exactly the same keys whatever the language's
 * plural rules are.
 */
function countKey(prefix: string, count: number): string {
  return `${prefix}.${count === 1 ? 'one' : 'other'}`;
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
  t: Translate,
  capabilities: PermissionSetCapabilities,
): string {
  if (capabilities.unrestricted)
    return t('permissionSets.detail.badgeUnrestricted');
  return capabilities.protectedSet
    ? t('permissionSets.detail.badgeProtected')
    : t('permissionSets.detail.badgeCustom');
}

export function detailSummary(
  t: Translate,
  draft: Draft,
  assignments: readonly PermissionSetAssignment[],
  unrestricted: boolean,
): string {
  const assignments_ = t(
    countKey('permissionSets.assignmentCount', assignments.length),
    { count: assignments.length },
  );
  if (unrestricted)
    return t('permissionSets.detail.summaryUnrestricted', {
      key: draft.key,
      assignments: assignments_,
    });
  const permissions = permissionCountFromDraft(draft);
  const categories = new Set(draft.grants.map((grant) => grant.resource.type));
  return t('permissionSets.detail.summary', {
    key: draft.key,
    permissions: t(countKey('permissionSets.permissionCount', permissions), {
      count: permissions,
    }),
    types: t(countKey('permissionSets.resourceTypeCount', categories.size), {
      count: categories.size,
    }),
    assignments: assignments_,
  });
}

export function databaseAccessSummary(
  t: Translate,
  options: AuthorizationOptions,
  grant: GrantDraft,
): string {
  return grant.actions
    .map((action) => {
      const value = grant.database[action] ?? defaultDatabaseActionDraft();
      return t('labels.actionScope', {
        action: humanize(action),
        scope:
          action === 'create'
            ? t('labels.newRecordsLower')
            : recordAccessLabel(options, value.recordAccess),
      });
    })
    .join(', ');
}

/**
 * The records the granted actions start from, as one clause. A create selects
 * no records, so it is left out; actions that disagree say so once rather than
 * listing every one, because the side panel already carries the breakdown.
 */
export function recordsClause(
  t: Translate,
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
  if (labels.length === 0) return t('labels.newRecords');
  return new Set(labels).size > 1 ? t('labels.mixedRecords') : labels[0];
}

/** The two clauses a collection row carries: its records, then its fields. */
export function recordsAndFieldsSummary(
  t: Translate,
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
    ? t('labels.allFieldsLower')
    : t('labels.selectedFieldsLower');
  return t('labels.recordsAndFields', {
    records: recordsClause(t, options, grant),
    fields,
  });
}

export function databaseActionSummary(
  t: Translate,
  options: AuthorizationOptions,
  action: string,
  value: DatabaseActionDraft,
): string {
  const fields = actionFieldsSummary(t, action, value);
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
  t: Translate,
  action: string,
  value: DatabaseActionDraft,
): string {
  const parts: string[] = [];
  if (action === 'create' || action === 'update')
    parts.push(
      t('labels.writableFields', {
        fields: fieldSelectionLabel(t, value.input),
      }),
    );
  if (action === 'create' || action === 'read' || action === 'update')
    parts.push(
      t('labels.visibleFields', {
        fields: fieldSelectionLabel(t, value.output),
      }),
    );
  return parts.length === 0 ? NONE : parts.join(' · ');
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

export function databaseActionDescription(
  t: Translate,
  action: string,
): string {
  switch (action) {
    case 'create':
    case 'read':
    case 'update':
    case 'delete':
      return t(`databasePolicy.descriptions.${action}`);
    default:
      return t('databasePolicy.descriptions.other');
  }
}

export function fieldSelectionLabel(
  t: Translate,
  value: '*' | readonly string[],
): string {
  return value === '*'
    ? t('common.allFields')
    : t('labels.fieldCount', { count: value.length });
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
