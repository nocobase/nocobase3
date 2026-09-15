import type {
  AuthorizationOptions,
  AuthorizationSubject,
  DefaultAccessRule,
  PermissionSet,
  PermissionSetAssignment,
  RestrictionRule,
  SharingRule,
} from '../../authorization-client.js';
import { compareActions } from '../../components/rule-utils.js';
import {
  defaultDatabaseActionDraft,
  fromSet,
  recordAccessKey,
} from './drafts.js';
import {
  actionFieldsSummary,
  actionRecordsSummary,
  humanize,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import type { Draft, GrantDraft } from './types.js';

/**
 * What one action on one resource reaches: every record, some of them, or
 * nothing. A set conferring unrestricted access has no grants to read, so it
 * carries its own mark rather than reading as "not granted".
 */
export type GrantMark = 'all' | 'scoped' | 'none' | 'bypass';

export const markLabels: Readonly<Record<GrantMark, string>> = {
  all: 'Every record',
  scoped: 'Scoped records',
  none: 'Not granted',
  bypass: 'Unrestricted',
};

/** What the mark means, for a tooltip and for the legend. */
export const markDescriptions: Readonly<Record<GrantMark, string>> = {
  all: 'Every record',
  scoped: 'Scoped records',
  none: 'Not granted',
  bypass: 'Unrestricted: grants are not consulted',
};

/** The resource type whose grants carry record access and field selections. */
export const COLLECTION_TYPE: string = 'database.collection';

/** What the value stands for where an action names no records or no fields. */
const NONE = '—';

export function actionMark(grant: GrantDraft, action: string): GrantMark {
  if (!grant.actions.includes(action)) return 'none';
  if (grant.resource.type !== COLLECTION_TYPE) return 'all';
  // A create selects no records, so it is never scoped.
  if (action === 'create') return 'all';
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  return recordAccessKey(value.recordAccess) === 'allRecords'
    ? 'all'
    : 'scoped';
}

/** One permission set's access to one resource, marked action by action. */
export interface ResourceAccessRow {
  readonly key: string;
  readonly set: PermissionSet;
  readonly title: string;
  /** One mark per action, in the order the actions were given. */
  readonly marks: readonly GrantMark[];
}

/**
 * The actions one resource offers: the ones its kind declares, plus any a grant
 * names that the kind no longer does. The vocabulary is uniform by
 * construction, because every row is the same resource.
 */
export function resourceActions(
  options: AuthorizationOptions,
  sets: readonly PermissionSet[],
  resource: { type: string; id: string },
): readonly string[] {
  const declared = (
    options.resourceTypes.find((item) => item.value === resource.type)
      ?.actions ?? []
  ).map((item) => item.value);
  const granted = sets.flatMap((set) =>
    set.grants
      .filter(
        (grant) =>
          grant.resource.type === resource.type &&
          grant.resource.id === resource.id,
      )
      .flatMap((grant) => grant.actions.map((action) => action.action)),
  );
  return [...new Set([...declared, ...granted])]
    .map((value) => ({ value }))
    .sort(compareActions)
    .map((item) => item.value);
}

/**
 * The sets that grant anything on one resource, marked action by action. A set
 * conferring unrestricted access is always reported, because its grants are
 * never consulted and it reaches the resource all the same.
 */
export function resourceAccessRows(
  sets: readonly PermissionSet[],
  resource: { type: string; id: string },
  actions: readonly string[],
): readonly ResourceAccessRow[] {
  return sets.flatMap((set) => {
    const draft = fromSet(set);
    const grant = draft.grants.find(
      (item) =>
        item.resource.type === resource.type &&
        item.resource.id === resource.id,
    );
    if (
      set.unrestricted !== true &&
      (grant === undefined || grant.actions.length === 0)
    )
      return [];
    return [
      {
        key: set.key,
        set,
        title: setTitle(set),
        marks: actions.map((action) => setMark(set, draft, resource, action)),
      },
    ];
  });
}

/** One line of the diff: a resource and an action, marked for each of the two sets. */
export interface SetDiffRow {
  readonly key: string;
  readonly resourceType: string;
  /** The label of the resource type, which the table repeats as a group heading. */
  readonly groupLabel: string;
  readonly resourceLabel: string;
  readonly action: string;
  readonly left: GrantMark;
  readonly right: GrantMark;
  /** True where the two sets do not reach the same thing, which is what the table shows by default. */
  readonly differs: boolean;
}

/**
 * Every resource and action either set grants, marked for both. A set
 * conferring unrestricted access carries no grants, so it is marked as a bypass
 * throughout rather than as granting nothing.
 */
export function setDiffRows(
  options: AuthorizationOptions,
  left: PermissionSet,
  right: PermissionSet,
): readonly SetDiffRow[] {
  const sides = [left, right].map((set) => ({ set, draft: fromSet(set) }));
  const grants = sides.flatMap((side) => side.draft.grants);
  return orderedTypes(options, grants).flatMap((type) => {
    const groupLabel = resourceTypeLabel(options, type);
    return resourceIds(grants, type).flatMap((id) => {
      const resource = { type, id };
      return actionsFor(grants, resource).map((action) => {
        const [first, second] = sides.map(({ set, draft }) =>
          setMark(set, draft, resource, action),
        ) as [GrantMark, GrantMark];
        return {
          key: `${type}:${id}:${action}`,
          resourceType: type,
          groupLabel,
          resourceLabel: resourceLabel(options, resource),
          action,
          left: first,
          right: second,
          differs: first !== second,
        };
      });
    });
  });
}

function setMark(
  set: PermissionSet,
  draft: Draft,
  resource: { type: string; id: string },
  action: string,
): GrantMark {
  // Grants are not consulted for an unrestricted set, so its marks say so.
  if (set.unrestricted === true) return 'bypass';
  const grant = draft.grants.find(
    (item) =>
      item.resource.type === resource.type && item.resource.id === resource.id,
  );
  return grant ? actionMark(grant, action) : 'none';
}

/** How a person came to hold a set. */
export type HeldVia = 'assigned' | 'authenticated';

export interface HeldSet {
  readonly set: PermissionSet;
  readonly via: HeldVia;
}

export const heldViaLabels: Readonly<Record<HeldVia, string>> = {
  assigned: 'Assigned directly',
  authenticated: 'Held by every signed-in user',
};

/**
 * The sets one person holds: the ones assigned to them, and the ones every
 * signed-in user holds. A set reached both ways is reported as assigned.
 */
export function setsHeldBy(
  userId: string,
  sets: readonly PermissionSet[],
  assignments: readonly PermissionSetAssignment[],
): readonly HeldSet[] {
  const held = new Map<string, HeldVia>();
  for (const assignment of assignments) {
    const via = assignmentVia(userId, assignment.subject);
    if (via === undefined) continue;
    if (via === 'assigned' || !held.has(assignment.permissionSet))
      held.set(assignment.permissionSet, via);
  }
  return sets.flatMap((set) => {
    const via = held.get(set.key);
    return via === undefined ? [] : [{ set, via }];
  });
}

function assignmentVia(
  userId: string,
  subject: AuthorizationSubject,
): HeldVia | undefined {
  if (subject.type === 'user' && subject.id === userId) return 'assigned';
  return subject.type === 'authenticated' ? 'authenticated' : undefined;
}

/** True when one of the held sets confers unrestricted access. */
export function holdsUnrestricted(held: readonly HeldSet[]): boolean {
  return held.some((item) => item.set.unrestricted === true);
}

export interface UserActionGrant {
  readonly action: string;
  /** The records the action starts from, before any rule widens or narrows them. */
  readonly records: string;
  readonly fields: string;
  /** The set that granted it. */
  readonly grantedBy: string;
}

export interface UserResourceGrant {
  readonly key: string;
  readonly resource: { readonly type: string; readonly id: string };
  readonly label: string;
  readonly groupLabel: string;
  readonly actions: readonly UserActionGrant[];
}

/**
 * What the sets a person holds grant, grouped by resource. Two sets granting
 * the same action both appear, because each says which set granted it.
 */
export function userGrants(
  options: AuthorizationOptions,
  held: readonly HeldSet[],
): readonly UserResourceGrant[] {
  const sources = held.map((item) => ({
    title: setTitle(item.set),
    draft: fromSet(item.set),
  }));
  const grants = sources.flatMap((source) => source.draft.grants);
  return orderedTypes(options, grants).flatMap((type) =>
    resourceIds(grants, type).map((id) => {
      const resource = { type, id };
      return {
        key: `${type}:${id}`,
        resource,
        label: resourceLabel(options, resource),
        groupLabel: resourceTypeLabel(options, type),
        actions: sources.flatMap((source) =>
          source.draft.grants
            .filter(
              (grant) =>
                grant.resource.type === type && grant.resource.id === id,
            )
            .flatMap((grant) =>
              [...grant.actions]
                .map((value) => ({ value }))
                .sort(compareActions)
                .map((item) =>
                  actionGrant(options, grant, item.value, source.title),
                ),
            ),
        ),
      };
    }),
  );
}

function actionGrant(
  options: AuthorizationOptions,
  grant: GrantDraft,
  action: string,
  grantedBy: string,
): UserActionGrant {
  if (grant.resource.type !== COLLECTION_TYPE)
    return { action, records: NONE, fields: NONE, grantedBy };
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  return {
    action,
    records: actionRecordsSummary(options, action, value),
    fields: actionFieldsSummary(action, value),
    grantedBy,
  };
}

export function setTitle(set: PermissionSet): string {
  return set.title ?? humanize(set.key);
}

/** The collections the held grants name, which is what decides the rules worth listing. */
export function collectionsInPlay(held: readonly HeldSet[]): readonly string[] {
  return [
    ...new Set(
      held.flatMap((item) =>
        item.set.grants
          .filter((grant) => grant.resource.type === COLLECTION_TYPE)
          .map((grant) => grant.resource.id),
      ),
    ),
  ];
}

/** Whether a rule adds records to what a grant reaches, or takes them away. */
export type RuleDirection = 'widens' | 'narrows';

export interface RelevantRule {
  readonly key: string;
  readonly title: string;
  readonly direction: RuleDirection;
  readonly collection: string;
  readonly actions: readonly string[];
  /** Who the rule is addressed to, for the rules that name subjects. */
  readonly audience?: string;
}

/** Default access applies to everyone, so the collections in play decide what is worth listing. */
export function relevantDefaultAccess(
  rules: readonly DefaultAccessRule[],
  collections: readonly string[],
): readonly RelevantRule[] {
  return rules
    .filter(
      (rule) =>
        rule.resource.type === COLLECTION_TYPE &&
        collections.includes(rule.resource.id),
    )
    .map((rule) => ({
      key: `${rule.resource.type}:${rule.resource.id}`,
      title: rule.resource.id,
      direction: 'widens' as const,
      collection: rule.resource.id,
      actions: rule.actions.map((action) => action.action),
      audience: 'Everyone',
    }));
}

export function relevantSharingRules(
  rules: readonly SharingRule[],
  userId: string,
): readonly RelevantRule[] {
  return rules
    .filter((rule) => addresses(rule.subjects, userId))
    .map((rule) => ({
      key: rule.key,
      title: rule.title ?? humanize(rule.key),
      direction: 'widens' as const,
      collection: rule.resource.id,
      actions: rule.actions.map((action) => action.action),
      audience: audienceLabel(rule.subjects, userId),
    }));
}

export function relevantRestrictionRules(
  rules: readonly RestrictionRule[],
  userId: string,
): readonly RelevantRule[] {
  return rules
    .filter((rule) => addresses(rule.subjects, userId))
    .map((rule) => ({
      key: rule.key,
      title: rule.title ?? humanize(rule.key),
      direction: 'narrows' as const,
      collection: rule.resource.id,
      actions: rule.actions.map((action) => action.action),
      audience: audienceLabel(rule.subjects, userId),
    }));
}

function addresses(
  subjects: readonly AuthorizationSubject[],
  userId: string,
): boolean {
  return subjects.some(
    (subject) =>
      subject.type === 'authenticated' ||
      (subject.type === 'user' && subject.id === userId),
  );
}

function audienceLabel(
  subjects: readonly AuthorizationSubject[],
  userId: string,
): string {
  return subjects.some(
    (subject) => subject.type === 'user' && subject.id === userId,
  )
    ? 'This person'
    : 'All signed-in users';
}

/** Resource types in the order the options declare them, with any the options no longer declare after them. */
function orderedTypes(
  options: AuthorizationOptions,
  grants: readonly GrantDraft[],
): readonly string[] {
  const present = new Set(grants.map((grant) => grant.resource.type));
  const declared = options.resourceTypes
    .map((item) => item.value)
    .filter((value) => present.has(value));
  return [...new Set([...declared, ...present])];
}

function resourceIds(
  grants: readonly GrantDraft[],
  type: string,
): readonly string[] {
  return [
    ...new Set(
      grants
        .filter((grant) => grant.resource.type === type)
        .map((grant) => grant.resource.id),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function actionsFor(
  grants: readonly GrantDraft[],
  resource: { type: string; id: string },
): readonly string[] {
  return [
    ...new Set(
      grants
        .filter(
          (grant) =>
            grant.resource.type === resource.type &&
            grant.resource.id === resource.id,
        )
        .flatMap((grant) => grant.actions),
    ),
  ]
    .map((value) => ({ value }))
    .sort(compareActions)
    .map((item) => item.value);
}
