import type {
  AccessScope,
  AuthorizationOptions,
} from '../authorization-client.js';
import type { Translate } from '../i18n.js';

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

export function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** How one action is named: as its resource type declares it, else humanised. */
export function actionLabel(
  options: AuthorizationOptions,
  type: string,
  action: string,
  resourceId?: string,
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === type)
      ?.resources.find((item) => item.value === resourceId)
      ?.actions?.find((item) => item.value === action)?.label ??
    options.resourceTypes
      .find((item) => item.value === type)
      ?.actions.find((item) => item.value === action)?.label ??
    humanize(action)
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

export function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return (
    options.collections.find((collection) => collection.name === name)
      ?.fields ?? []
  );
}

export function accessScopeLabel(
  t: Translate,
  scope: AccessScope,
  options: AuthorizationOptions,
): string {
  if (scope.type === 'all') return t('labels.allRecords');
  if (scope.type === 'ids')
    return t('labels.selectedRecords', { count: scope.ids.length });
  const key =
    typeof scope.recordAccess === 'string'
      ? scope.recordAccess
      : scope.recordAccess.key;
  return (
    options.recordAccessPolicies.find((item) => item.value === key)?.label ??
    key
  );
}
