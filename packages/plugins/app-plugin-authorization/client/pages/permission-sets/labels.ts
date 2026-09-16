export * from '../../components/action-labels.js';
import { humanize, type GrantMark } from '../../components/action-labels.js';
import type { AuthorizationOptions } from '../../authorization-client.js';
import { recordAccessKey } from './drafts.js';
import { resourceTypePresentation } from './resource-presentation.js';
import type { GrantDraft, RecordAccessDraft } from './types.js';
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
