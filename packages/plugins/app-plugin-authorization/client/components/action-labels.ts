import type {
  AuthorizationOptions,
  RecordSelection,
} from '../authorization-client.js';
import type { Translate } from '../i18n.js';
import { findResource, resourceActions } from './localized-options.js';

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
    resourceActions(options, { type, id: resourceId }).find(
      (item) => item.value === action,
    )?.label ??
    resourceActions(options, { type }).find((item) => item.value === action)
      ?.label ??
    humanize(action)
  );
}

export function resourceLabel(
  options: AuthorizationOptions,
  resource: { type: string; id: string },
): string {
  return findResource(options, resource)?.label ?? resource.id;
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

/** What a record selection reads as. */
export function selectionLabel(
  t: Translate,
  selection: RecordSelection,
  options: AuthorizationOptions,
): string {
  if (selection.type === 'all') return t('labels.allRecords');
  if (selection.type === 'records')
    return t('labels.selectedRecords', { count: selection.ids.length });
  return (
    options.recordAccess.find((item) => item.value === selection.key)?.label ??
    selection.key
  );
}
