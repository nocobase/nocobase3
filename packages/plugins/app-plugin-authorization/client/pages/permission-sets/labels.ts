import type {
  AuthorizationOptions,
  AuthorizationSubject,
} from '../../authorization-client.js';
import type { UserDirectory } from '../../components/user-directory.js';
import type { Translate } from '../../i18n.js';
import { recordAccessKey } from './drafts.js';
import { resourceTypePresentation } from './resource-presentation.js';
import type {
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

export function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return (
    options.collections.find((collection) => collection.name === name)
      ?.fields ?? []
  );
}
