import type {
  AccessScope,
  AuthorizationOptions,
} from '../authorization-client.js';

export function firstActions(
  options: AuthorizationOptions,
  type: string,
  resourceId?: string,
): readonly string[] {
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const actions =
    resourceType?.resources.find((item) => item.value === resourceId)
      ?.actions ?? resourceType?.actions;
  const action = actions?.slice().sort(compareActions)[0];
  return action ? [action.value] : [];
}

export function compareActions(
  left: { value: string },
  right: { value: string },
): number {
  const order = ['create', 'read', 'update', 'delete'];
  const leftIndex = order.indexOf(left.value);
  const rightIndex = order.indexOf(right.value);
  return (
    (leftIndex < 0 ? order.length : leftIndex) -
    (rightIndex < 0 ? order.length : rightIndex)
  );
}
export function defaultScope(options: AuthorizationOptions): AccessScope {
  return options.recordAccessPolicies[0]
    ? { type: 'database', recordAccess: options.recordAccessPolicies[0].value }
    : { type: 'all' };
}
