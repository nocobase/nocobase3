import ignore from "ignore";

import { resolveAclDataSourceKey } from "./data-source.ts";
import { getRecordActionPermission } from "./record-permissions.ts";
import type {
  AclAccessRequest,
  AclActionParams,
  AclPermissionSet,
  AclResourcePermissions,
  ResourceAcl,
  RoleConstraint,
} from "./types.ts";

const REFINE_ACTION_MAP: Record<string, string> = {
  list: "list",
  show: "get",
  create: "create",
  edit: "update",
  delete: "destroy",
  clone: "create",
};

const getResourceAcl = (request: AclAccessRequest) =>
  request.resourceItem?.meta?.acl as ResourceAcl | undefined;

export const mapRefineAction = (action: string) =>
  REFINE_ACTION_MAP[action] ?? action;

export const getPermissionsForDataSource = (
  permissions: AclPermissionSet,
  dataSourceKey = "main"
): AclResourcePermissions => {
  const dataSourcePermissions = permissions.dataSources?.[dataSourceKey];
  return dataSourcePermissions
    ? {
        ...permissions,
        ...dataSourcePermissions,
        snippets: permissions.snippets,
      }
    : permissions;
};

export const resolveActionPermission = ({
  permissions,
  resource,
  action,
  dataSourceKey = "main",
}: {
  permissions: AclPermissionSet;
  resource: string;
  action: string;
  dataSourceKey?: string;
}): AclActionParams | null => {
  const data = getPermissionsForDataSource(permissions, dataSourceKey);
  if (data.allowAll) return {};

  const canonicalAction = data.actionAlias?.[action] ?? action;
  if (data.resources?.includes(resource)) {
    return (
      data.actions?.[`${resource}:${canonicalAction}`] ??
      data.actions?.[`${resource}:${action}`] ??
      null
    );
  }

  const strategyAllowed = data.strategy?.actions?.some(
    (item) => item.split(":")[0] === canonicalAction
  );
  return strategyAllowed ? {} : null;
};

const matchesSnippet = (snippets: string[], target: string) =>
  !target || target === "*" || ignore().add(snippets).ignores(target);

export const getEffectiveRoles = (permissions: AclPermissionSet) =>
  permissions.roles;

export const matchesRoleConstraint = (
  permissions: AclPermissionSet,
  constraint?: RoleConstraint
) => {
  if (!constraint || permissions.allowAll) return true;

  const roles = new Set(getEffectiveRoles(permissions));

  return (
    (!constraint.anyOf?.length ||
      constraint.anyOf.some((role) => roles.has(role))) &&
    (!constraint.allOf?.length ||
      constraint.allOf.every((role) => roles.has(role))) &&
    (!constraint.noneOf?.length ||
      constraint.noneOf.every((role) => !roles.has(role)))
  );
};

export type RecordPermissionResolver = typeof getRecordActionPermission;

export const evaluateAccess = (
  permissions: AclPermissionSet,
  request: AclAccessRequest,
  getRecordPermission: RecordPermissionResolver = getRecordActionPermission
) => {
  const resourceAcl = getResourceAcl(request);
  if (
    !matchesRoleConstraint(
      permissions,
      resourceAcl === false ? undefined : resourceAcl?.roles
    ) ||
    !matchesRoleConstraint(permissions, request.roles)
  ) {
    return false;
  }

  if (resourceAcl === false || resourceAcl?.type === "authenticated") {
    return true;
  }

  if (resourceAcl?.type === "snippet") {
    return (
      permissions.allowAll ||
      matchesSnippet(permissions.snippets ?? [], resourceAcl.name)
    );
  }

  if (resourceAcl?.type === "route") {
    return (
      permissions.allowAll ||
      (permissions.allowMenuItemIds ?? [])
        .map(String)
        .includes(String(resourceAcl.routeId))
    );
  }

  const targetResource =
    resourceAcl?.type === "collection" && resourceAcl.resource
      ? resourceAcl.resource
      : request.resource;
  if (!targetResource) return true;

  const dataSourceKey =
    resolveAclDataSourceKey(
      request,
      request.meta as
        | { dataSourceKey?: unknown; acl?: ResourceAcl }
        | undefined,
      request.resourceItem?.meta as
        | { dataSourceKey?: unknown; acl?: ResourceAcl }
        | undefined
    ) ?? "main";
  const requestedAction = request.action ?? "list";
  const mappedAction =
    (resourceAcl?.type === "collection" &&
      resourceAcl.actionMap?.[requestedAction]) ||
    mapRefineAction(requestedAction);
  const permission = resolveActionPermission({
    permissions,
    resource: targetResource,
    action: mappedAction,
    dataSourceKey,
  });
  if (!permission) return false;

  if (request.id !== undefined) {
    const recordPermission = getRecordPermission({
      dataSourceKey,
      resource: targetResource,
      action: mappedAction,
      id: request.id,
      actionAlias: getPermissionsForDataSource(permissions, dataSourceKey)
        .actionAlias,
    });
    if (recordPermission !== undefined) return recordPermission;
  }

  if (request.field) {
    const fields = [
      ...(permission.fields ?? []),
      ...(permission.whitelist ?? []),
      ...(permission.appends ?? []),
    ];
    if (!fields.length) return true;
    return fields.includes(request.field);
  }

  return true;
};
