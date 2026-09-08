import type { UserRoleScopeOption, UserRoleValue } from './user-client.js';

export function emptyRoleScopeValues(
  scopes: readonly UserRoleScopeOption[],
): Record<string, UserRoleValue> {
  return Object.fromEntries(
    scopes.map((scope) => [
      scope.key,
      scope.selection === 'multiple' ? [] : '',
    ]),
  );
}

export function selectedRoleScopeValues(
  scopes: readonly UserRoleScopeOption[],
  values: Readonly<Record<string, UserRoleValue>>,
): Readonly<Record<string, UserRoleValue>> {
  return Object.fromEntries(
    scopes.flatMap((scope) => {
      const value = values[scope.key];
      return value !== undefined && roleValueCount(value) > 0
        ? [[scope.key, value] as const]
        : [];
    }),
  );
}

export function hasEveryRequiredRoleScope(
  scopes: readonly UserRoleScopeOption[],
  values: Readonly<Record<string, UserRoleValue>>,
): boolean {
  return scopes.every(
    (scope) =>
      !scope.requiredOnCreate || roleValueCount(values[scope.key] ?? '') > 0,
  );
}

function roleValueCount(value: UserRoleValue): number {
  return typeof value === 'string'
    ? Number(value.trim().length > 0)
    : value.length;
}
