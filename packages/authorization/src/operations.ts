import type { AuthorizationDefinition } from './definition.js';
import type {
  Assignment,
  OrganizationWideDefault,
  PermissionSet,
  PermissionSetGroup,
  RestrictionRule,
  SharingRule,
} from './types.js';

export type AuthorizationOperation =
  | { type: 'upsertPermissionSet'; key: string; value: PermissionSet }
  | { type: 'removePermissionSet'; key: string }
  | { type: 'upsertPermissionSetGroup'; key: string; value: PermissionSetGroup }
  | { type: 'removePermissionSetGroup'; key: string }
  | { type: 'upsertAssignment'; id: string; value: Assignment }
  | { type: 'removeAssignment'; id: string }
  | {
      type: 'setOrganizationWideDefault';
      resource: string;
      value: OrganizationWideDefault;
    }
  | { type: 'removeOrganizationWideDefault'; resource: string }
  | { type: 'upsertSharingRule'; key: string; value: SharingRule }
  | { type: 'removeSharingRule'; key: string }
  | { type: 'upsertRestrictionRule'; key: string; value: RestrictionRule }
  | { type: 'removeRestrictionRule'; key: string };

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (typeof left !== typeof right || left == null || right == null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((item, index) => equal(item, right[index]));
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && equal(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

function keyed<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

function diffKeyed<T>(
  current: readonly T[],
  desired: readonly T[],
  key: (item: T) => string,
  upsert: (key: string, value: T) => AuthorizationOperation,
  remove: (key: string) => AuthorizationOperation,
): AuthorizationOperation[] {
  const currentMap = keyed(current, key);
  const desiredMap = keyed(desired, key);
  const operations: AuthorizationOperation[] = [];
  for (const [itemKey, value] of desiredMap) {
    if (!currentMap.has(itemKey) || !equal(currentMap.get(itemKey), value)) {
      operations.push(upsert(itemKey, value));
    }
  }
  for (const itemKey of currentMap.keys()) {
    if (!desiredMap.has(itemKey)) {
      operations.push(remove(itemKey));
    }
  }
  return operations;
}

/** Creates a deterministic, inspectable change plan between two authorization snapshots. */
export function diffAuthorization(
  currentInput: AuthorizationDefinition,
  desiredInput: AuthorizationDefinition,
): AuthorizationOperation[] {
  const current = currentInput;
  const desired = desiredInput;
  const operations: AuthorizationOperation[] = [];
  operations.push(
    ...diffKeyed(
      current.permissionSets,
      desired.permissionSets,
      (item) => item.key,
      (key, value) => ({ type: 'upsertPermissionSet', key, value }),
      (key) => ({ type: 'removePermissionSet', key }),
    ),
  );
  operations.push(
    ...diffKeyed(
      current.permissionSetGroups,
      desired.permissionSetGroups,
      (item) => item.key,
      (key, value) => ({ type: 'upsertPermissionSetGroup', key, value }),
      (key) => ({ type: 'removePermissionSetGroup', key }),
    ),
  );
  operations.push(
    ...diffKeyed(
      current.assignments,
      desired.assignments,
      (item) => item.id,
      (id, value) => ({ type: 'upsertAssignment', id, value }),
      (id) => ({ type: 'removeAssignment', id }),
    ),
  );

  const currentDefaults = current.organizationWideDefaults;
  const desiredDefaults = desired.organizationWideDefaults;
  for (const [resource, value] of Object.entries(desiredDefaults)) {
    if (
      !(resource in currentDefaults) ||
      !equal(currentDefaults[resource], value)
    ) {
      operations.push({ type: 'setOrganizationWideDefault', resource, value });
    }
  }
  for (const resource of Object.keys(currentDefaults)) {
    if (!(resource in desiredDefaults)) {
      operations.push({ type: 'removeOrganizationWideDefault', resource });
    }
  }
  operations.push(
    ...diffKeyed(
      current.sharingRules,
      desired.sharingRules,
      (item) => item.key,
      (key, value) => ({ type: 'upsertSharingRule', key, value }),
      (key) => ({ type: 'removeSharingRule', key }),
    ),
  );
  operations.push(
    ...diffKeyed(
      current.restrictionRules,
      desired.restrictionRules,
      (item) => item.key,
      (key, value) => ({ type: 'upsertRestrictionRule', key, value }),
      (key) => ({ type: 'removeRestrictionRule', key }),
    ),
  );
  return operations;
}
