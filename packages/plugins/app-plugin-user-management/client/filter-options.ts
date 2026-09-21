import type { UserRoleScopeOption } from './user-client.js';

export interface UserFilterOption {
  readonly value: string;
  readonly label: string;
}

export function createStatusFilterOptions(labels: {
  readonly all: string;
  readonly enabled: string;
  readonly disabled: string;
}): readonly UserFilterOption[] {
  return [
    { value: 'all', label: labels.all },
    { value: 'enabled', label: labels.enabled },
    { value: 'disabled', label: labels.disabled },
  ];
}

export function createRoleFilterOptions(
  scopes: readonly UserRoleScopeOption[],
  allLabel: string,
): readonly UserFilterOption[] {
  return [
    { value: 'all', label: allLabel },
    ...scopes.flatMap((scope) =>
      scope.options.map((option) => ({
        value: `${scope.key}:${option.value}`,
        label: option.label,
      })),
    ),
  ];
}
