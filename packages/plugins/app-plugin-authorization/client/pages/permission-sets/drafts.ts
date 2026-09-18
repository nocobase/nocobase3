import type { Draft, GrantDraft } from './types.js';
import { titleText, type Translate } from '../../i18n.js';
import { incompleteFilter, policyFilter } from '../../components/filter-ast.js';
import type {
  PermissionGrant,
  PermissionSet,
} from '../../authorization-client.js';
let nextId = 0;

/** Draft rows are keyed by an id the server never sees. */
export function nextDraftId(): number {
  return ++nextId;
}

export function toInput(draft: Draft): {
  key: string;
  title?: string | { key: string; ns: string };
  grants: readonly PermissionGrant[];
} {
  return {
    key: draft.key.trim(),
    ...(draft.title.trim()
      ? {
          title:
            draft.title === draft.initialTitle
              ? draft.originalTitle
              : draft.title.trim(),
        }
      : {}),
    grants: draft.grants.map((grant) => ({
      resource: grant.resource,
      actions: grant.actions.map((action) => ({
        action,
        ...(grant.policies?.[action] ? { policy: grant.policies[action] } : {}),
      })),
    })),
  };
}

export function newGrantForResource(type: string, id: string): GrantDraft {
  return {
    id: nextDraftId(),
    resource: {
      type,
      id,
    },
    actions: [],
  };
}

export function empty(): Draft {
  return { key: '', title: '', grants: [] };
}

export function hasEmptyCustomFilter(draft: Draft): boolean {
  return draft.grants.some((grant) =>
    Object.values(grant.policies ?? {}).some(
      (policy) =>
        policy?.type === 'resource' &&
        Object.values(policy).some((value) => {
          if (
            !value ||
            typeof value !== 'object' ||
            !('key' in value) ||
            value.key !== 'customFilter'
          )
            return false;
          return incompleteFilter(
            policyFilter(value as { key: string; params?: unknown }),
          );
        }),
    ),
  );
}

export function fromSet(
  set: PermissionSet,
  t: Translate = (key) => key,
): Draft {
  return {
    originalKey: set.key,
    key: set.key,
    title: titleText(set.title, t),
    originalTitle: set.title,
    initialTitle: titleText(set.title, t),
    grants: set.grants.map((grant) => {
      return {
        id: nextDraftId(),
        resource: grant.resource,
        actions: grant.actions.map((action) => action.action),
        policies: Object.fromEntries(
          grant.actions.map((action) => [action.action, action.policy]),
        ),
      };
    }),
  };
}

export function resourceKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}
