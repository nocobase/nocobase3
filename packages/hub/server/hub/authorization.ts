import type { HubCapability, HubRole, HubUserSummary } from './types.ts';
import {
  HubDomainError,
  type HubAppScope,
  type HubRoleAssignment,
  type HubStore,
} from './store.ts';

export type HubResource =
  | 'hub.app'
  | 'hub.repository'
  | 'hub.release'
  | 'hub.deployment'
  | 'hub.runtime'
  | 'hub.runtimeSecret'
  | 'hub.auditLog'
  | 'hub.member'
  | 'hub.permission'
  | 'hub.setting';

export type HubAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'deploy'
  | 'rollback'
  | 'redeploy'
  | 'control'
  | 'rotate'
  | 'export'
  | 'assign';

export interface HubAuthorizationRequest {
  resource: HubResource;
  action: HubAction;
  applicationId?: string;
}

export interface HubApplicationCapabilities {
  applicationId: string;
  capabilities: HubCapability[];
}

export interface HubCapabilities {
  global: HubCapability[];
  application: HubApplicationCapabilities[];
}

export interface HubRoleDefinition {
  readonly id: HubRole;
  readonly scopes: readonly ('global' | 'application')[];
  readonly preservesOwnership: boolean;
  readonly descriptionKey: string;
  readonly capabilities: readonly string[];
}

export interface AuthorizedHubActor {
  user: HubUserSummary;
  roles: HubRole[];
  capabilities: HubCapabilities;
}

export const ROLE_CAPABILITIES: Readonly<
  Record<HubRole, readonly HubCapability[]>
> = {
  owner: [{ resource: '*', actions: ['*'] }],
  admin: [
    {
      resource: 'hub.app',
      actions: ['create', 'read', 'update', 'archive', 'restore'],
    },
    { resource: 'hub.repository', actions: ['read', 'update'] },
    { resource: 'hub.release', actions: ['create', 'read', 'update'] },
    {
      resource: 'hub.deployment',
      actions: ['read', 'deploy', 'rollback', 'redeploy'],
    },
    { resource: 'hub.runtime', actions: ['read', 'control'] },
    { resource: 'hub.runtimeSecret', actions: ['read', 'rotate'] },
    { resource: 'hub.auditLog', actions: ['read', 'export'] },
    { resource: 'hub.member', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'hub.permission', actions: ['read', 'assign'] },
    { resource: 'hub.setting', actions: ['read', 'update'] },
  ],
  developer: [
    { resource: 'hub.app', actions: ['read'] },
    { resource: 'hub.repository', actions: ['read', 'update'] },
    { resource: 'hub.release', actions: ['read', 'create'] },
    { resource: 'hub.deployment', actions: ['read'] },
    { resource: 'hub.runtime', actions: ['read'] },
    { resource: 'hub.auditLog', actions: ['read'] },
  ],
  deployer: [
    { resource: 'hub.app', actions: ['read'] },
    { resource: 'hub.release', actions: ['read'] },
    {
      resource: 'hub.deployment',
      actions: ['read', 'deploy', 'rollback', 'redeploy'],
    },
    { resource: 'hub.runtime', actions: ['read', 'control'] },
    { resource: 'hub.auditLog', actions: ['read'] },
  ],
  viewer: [
    { resource: 'hub.app', actions: ['read'] },
    { resource: 'hub.release', actions: ['read'] },
    { resource: 'hub.deployment', actions: ['read'] },
    { resource: 'hub.runtime', actions: ['read'] },
    { resource: 'hub.repository', actions: ['read'] },
    { resource: 'hub.auditLog', actions: ['read'] },
  ],
};

export const HUB_ROLE_DEFINITIONS: readonly HubRoleDefinition[] = Object.freeze(
  (Object.keys(ROLE_CAPABILITIES) as HubRole[]).map((role) => ({
    id: role,
    scopes: (role === 'owner' || role === 'admin'
      ? ['global']
      : ['global', 'application']) as ('global' | 'application')[],
    preservesOwnership: role === 'owner',
    descriptionKey: `hub.roles.${role}.description`,
    capabilities: ROLE_CAPABILITIES[role].flatMap((capability) =>
      capability.actions.map((action) => `${capability.resource}:${action}`),
    ),
  })),
);

export class HubAuthorization {
  constructor(private readonly store: HubStore) {}

  async require(
    userId: string,
    request: HubAuthorizationRequest,
  ): Promise<void> {
    if (!(await this.can(userId, request))) {
      throw new HubDomainError(
        'FORBIDDEN',
        `Missing ${request.resource}:${request.action} capability.`,
        { status: 403 },
      );
    }
  }

  async can(
    userId: string,
    request: HubAuthorizationRequest,
  ): Promise<boolean> {
    const [assignments, scopes] = await Promise.all([
      this.store.listRoleAssignments(userId),
      request.applicationId
        ? this.store.listAppScopes(userId)
        : Promise.resolve([]),
    ]);
    return (
      assignments.some((assignment) => assignmentAllows(assignment, request)) ||
      scopes.some((scope) => scopeAllows(scope, request))
    );
  }

  async actor(user: HubUserSummary): Promise<AuthorizedHubActor> {
    const [assignments, scopes] = await Promise.all([
      this.store.listRoleAssignments(user.id),
      this.store.listAppScopes(user.id),
    ]);
    const globalAssignments = assignments.filter(
      (assignment) => assignment.applicationId === null,
    );
    const roles = [
      ...new Set(globalAssignments.map((assignment) => assignment.role)),
    ];
    const global = mergeCapabilities(
      globalAssignments.flatMap(
        (assignment) => ROLE_CAPABILITIES[assignment.role],
      ),
    );
    const applicationIds = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.applicationId)
        applicationIds.add(assignment.applicationId);
    }
    for (const scope of scopes) applicationIds.add(scope.applicationId);

    const application = [...applicationIds].map((applicationId) => ({
      applicationId,
      capabilities: mergeCapabilities([
        ...assignments
          .filter((assignment) => assignment.applicationId === applicationId)
          .flatMap((assignment) => ROLE_CAPABILITIES[assignment.role]),
        ...scopes
          .filter((scope) => scope.applicationId === applicationId)
          .flatMap(scopeCapabilities),
      ]),
    }));
    return { user, roles, capabilities: { global, application } };
  }
}

function assignmentAllows(
  assignment: HubRoleAssignment,
  request: HubAuthorizationRequest,
): boolean {
  if (
    assignment.applicationId &&
    assignment.applicationId !== request.applicationId
  ) {
    return false;
  }
  return ROLE_CAPABILITIES[assignment.role].some((capability) =>
    capabilityAllows(capability, request),
  );
}

function scopeAllows(
  scope: HubAppScope,
  request: HubAuthorizationRequest,
): boolean {
  if (!request.applicationId || scope.applicationId !== request.applicationId) {
    return false;
  }
  const exact = `${request.resource}:${request.action}`;
  return scope.actions.some(
    (action) =>
      action === '*' ||
      action === exact ||
      action === `${request.resource}:*` ||
      action === request.action,
  );
}

function capabilityAllows(
  capability: HubCapability,
  request: HubAuthorizationRequest,
): boolean {
  return (
    (capability.resource === '*' || capability.resource === request.resource) &&
    (capability.actions.includes('*') ||
      capability.actions.includes(request.action))
  );
}

function scopeCapabilities(scope: HubAppScope): HubCapability[] {
  const grouped = new Map<string, Set<string>>();
  for (const value of scope.actions) {
    const separator = value.lastIndexOf(':');
    const resource = separator > 0 ? value.slice(0, separator) : '*';
    const action = separator > 0 ? value.slice(separator + 1) : value;
    const actions = grouped.get(resource) ?? new Set<string>();
    actions.add(action);
    grouped.set(resource, actions);
  }
  return [...grouped].map(([resource, actions]) => ({
    resource,
    actions: [...actions],
  }));
}

function mergeCapabilities(
  capabilities: readonly HubCapability[],
): HubCapability[] {
  const grouped = new Map<string, Set<string>>();
  for (const capability of capabilities) {
    const actions = grouped.get(capability.resource) ?? new Set<string>();
    for (const action of capability.actions) actions.add(action);
    grouped.set(capability.resource, actions);
  }
  return [...grouped].map(([resource, actions]) => ({
    resource,
    actions: [...actions],
  }));
}
