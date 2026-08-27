import type { AppAccessControlDefinition } from '../types.js';

export function normalizeAccessControlDefinition(
  input: AppAccessControlDefinition,
): AppAccessControlDefinition {
  const appKey = requireIdentifier(input.appKey, 'App key');
  const appName = input.appName.trim();
  const memberTableName = requireDatabaseIdentifier(
    input.memberTableName ?? 'appMembers',
  );
  const roles = input.roles.map((role) => ({
    ...role,
    key: requireIdentifier(role.key, 'Role key'),
    title: role.title.trim(),
    description: role.description.trim(),
    permissions: role.permissions.map((permission) => ({
      ...permission,
      resource: requireIdentifier(permission.resource, 'Resource name'),
      capabilities: [...new Set(permission.capabilities)],
    })),
  }));
  const resources = input.resources.map((resource) => ({
    ...resource,
    name: requireIdentifier(resource.name, 'Resource name'),
    title: resource.title.trim(),
  }));
  if (!appName) throw new Error('App name must not be empty.');
  if (!roles.some((role) => role.key === input.adminRoleKey)) {
    throw new Error(`Admin role ${input.adminRoleKey} is not defined.`);
  }
  const resourceNames = new Set(resources.map((resource) => resource.name));
  if (resourceNames.size !== resources.length) {
    throw new Error('Access-control resource names must be unique.');
  }
  const roleKeys = new Set(roles.map((role) => role.key));
  if (roleKeys.size !== roles.length) {
    throw new Error('Access-control role keys must be unique.');
  }
  for (const role of roles) {
    for (const permission of role.permissions) {
      if (!resourceNames.has(permission.resource)) {
        throw new Error(
          `Role ${role.key} references unknown resource ${permission.resource}.`,
        );
      }
      if (
        permission.scope === 'own' &&
        !resources.find((resource) => resource.name === permission.resource)
          ?.supportsOwnScope
      ) {
        throw new Error(
          `Resource ${permission.resource} does not support the own-record scope.`,
        );
      }
    }
  }
  return {
    ...input,
    appKey,
    appName,
    adminRoleKey: requireIdentifier(input.adminRoleKey, 'Admin role key'),
    memberTableName,
    roles,
    resources,
  };
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[a-zA-Z0-9_.-]+$/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function requireDatabaseIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(normalized)) {
    throw new Error('Member table name is invalid.');
  }
  return normalized;
}
