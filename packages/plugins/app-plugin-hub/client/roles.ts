export interface HubRoleGrant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly string[];
}

export interface HubRoleDefinition {
  readonly key: string;
  readonly title?: string;
  readonly grants: readonly HubRoleGrant[];
}

export type HubRoleCapabilityKey =
  | 'view-status'
  | 'view-resources'
  | 'create-release'
  | 'operate'
  | 'configure'
  | 'remove'
  | 'manage-users';

export type HubRoleCapabilityGroupKey =
  'visibility' | 'operations' | 'user-management';

export interface HubRoleCapabilityRequirement {
  readonly resourceType: string;
  readonly actions: readonly string[];
}

export interface HubRoleCapability {
  readonly key: HubRoleCapabilityKey;
  readonly group: HubRoleCapabilityGroupKey;
  readonly requirements: readonly HubRoleCapabilityRequirement[];
}

export const HUB_ROLE_CAPABILITY_GROUPS: readonly HubRoleCapabilityGroupKey[] =
  ['visibility', 'operations', 'user-management'] as const;

export const HUB_ROLE_CAPABILITIES: readonly HubRoleCapability[] = [
  {
    key: 'view-status',
    group: 'visibility',
    requirements: [
      requirement('hub.app', 'read', 'read-release', 'read-deployment'),
      requirement('hub.host', 'read'),
    ],
  },
  {
    key: 'view-resources',
    group: 'visibility',
    requirements: [requirement('hub.app', 'read-config')],
  },
  {
    key: 'create-release',
    group: 'operations',
    requirements: [requirement('hub.app', 'create', 'upload-release')],
  },
  {
    key: 'operate',
    group: 'operations',
    requirements: [
      requirement('hub.app', 'deploy', 'rollback', 'start', 'stop', 'restart'),
    ],
  },
  {
    key: 'configure',
    group: 'operations',
    requirements: [
      requirement(
        'hub.app',
        'update-settings',
        'read-config',
        'update-config',
        'read-config-template',
      ),
    ],
  },
  {
    key: 'remove',
    group: 'operations',
    requirements: [requirement('hub.app', 'remove')],
  },
  {
    key: 'manage-users',
    group: 'user-management',
    requirements: [
      requirement(
        'user',
        'read',
        'create',
        'update',
        'disable',
        'enable',
        'assign-role',
        'reset-password',
        'revoke-sessions',
      ),
    ],
  },
] as const;

function requirement(
  resourceType: string,
  ...actions: readonly string[]
): HubRoleCapabilityRequirement {
  return { resourceType, actions };
}

export function hasHubRoleCapability(
  role: HubRoleDefinition,
  capability: HubRoleCapability,
): boolean {
  return capability.requirements.every((required) =>
    required.actions.every((action) =>
      role.grants.some(
        (grant) =>
          grant.resource.type === required.resourceType &&
          grant.actions.includes(action),
      ),
    ),
  );
}
