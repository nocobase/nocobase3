import type { PermissionGrant } from '../plugins/permission-sets/model.js';
import type {
  AuthorizationResource,
  RecordAccessSelection,
} from './resources.js';

export function buildResourceGrant(
  definition: AuthorizationResource,
  actions:
    | readonly string[]
    | Readonly<Record<string, Readonly<Record<string, RecordAccessSelection>>>>,
): PermissionGrant {
  if (
    (Array.isArray(actions) ? actions : Object.keys(actions)).some(
      (action) => !definition.actions.some((item) => item.name === action),
    )
  )
    throw new TypeError('Unknown business resource or action');
  return structuredClone({
    resource: { type: 'resource', id: definition.name },
    actions: Array.isArray(actions)
      ? actions.map((action: string) => ({ action }))
      : Object.entries(
          actions as Readonly<
            Record<string, Readonly<Record<string, RecordAccessSelection>>>
          >,
        ).map(([action, scopes]) => ({
          action,
          policy: { type: 'resource', ...scopes },
        })),
  });
}
