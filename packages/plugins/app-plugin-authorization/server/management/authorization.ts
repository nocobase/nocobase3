import {
  AuthorizationActionBuilder,
  defineAuthorizationResource,
  type AuthorizationPluginSetup,
} from '@nocobase/authorization/core';
import type {
  CreatePermissionSetInput,
  PermissionSetsApi,
} from '@nocobase/authorization/permissions';
import { settingsApi, settingsResource } from './settings-resource.js';
import {
  createPermissionSetHandler,
  PERMISSION_SETS_ROUTE_PATH,
} from './permission-sets.js';

function settingsAction(resource: string, action: string) {
  return new AuthorizationActionBuilder([
    settingsApi.grant(resource, [action]),
  ]).title({ key: `options.actions.${action}` });
}

const permissionSetsResource = defineAuthorizationResource(
  'authorization.permission-sets',
  (resource) =>
    resource
      .title({ key: 'options.settings.permission-sets' })
      .group('authorization')
      .action('read', () =>
        settingsAction('authorization.permission-sets', 'read'),
      )
      .action('create', () =>
        settingsAction('authorization.permission-sets', 'create'),
      )
      .action('update', () =>
        settingsAction('authorization.permission-sets', 'update'),
      )
      .action('delete', () =>
        settingsAction('authorization.permission-sets', 'delete'),
      )
      .action('assign', () =>
        settingsAction('authorization.permission-sets', 'assign'),
      ),
);
const inspectorResource = defineAuthorizationResource(
  'authorization.inspector',
  (resource) =>
    resource
      .title({ key: 'options.settings.inspector' })
      .group('authorization')
      .action('inspect', () =>
        settingsAction('authorization.inspector', 'inspect'),
      ),
);

/** Install the management resources and their permission-set HTTP boundary. */
export function installPermissionSetAdministration(
  authz: AuthorizationPluginSetup,
  permissionSets: PermissionSetsApi,
): void {
  authz.resourceTypes.add(settingsResource);
  authz.resourceGroups.add({
    name: 'authorization',
    title: { key: 'options.settingsModules.authorization' },
    category: 'administration',
  });
  permissionSetsResource.register(authz.resources);
  inspectorResource.register(authz.resources);
  authz.routes.add(
    PERMISSION_SETS_ROUTE_PATH,
    createPermissionSetHandler(permissionSets, (input) =>
      validateRecordAccessPolicies(authz, input),
    ),
  );
}

function validateRecordAccessPolicies(
  authz: AuthorizationPluginSetup,
  input: CreatePermissionSetInput,
): void {
  for (const grant of input.grants) {
    if (grant.resource.type !== 'resource') continue;
    for (const action of grant.actions) {
      const expanded = authz.resources.expand({
        source: { plugin: 'permission-sets', id: input.key },
        resource: grant.resource,
        ...action,
      });
      for (const target of expanded) {
        if (target.resource.type !== 'database.collection') continue;
        const policies = target.policy?.recordAccess;
        if (!Array.isArray(policies)) continue;
        for (const value of policies) {
          const key: unknown =
            typeof value === 'string'
              ? value
              : value && typeof value === 'object'
                ? Reflect.get(value, 'key')
                : undefined;
          if (typeof key !== 'string')
            throw new TypeError('Invalid record access policy');
          const policy = authz.recordAccess.get(key);
          if (
            !policy ||
            !policy.resources.some(
              (resource) =>
                resource.type === target.resource.type &&
                (resource.id === '*' || resource.id === target.resource.id),
            )
          )
            throw new TypeError('Unknown or inapplicable record access policy');
        }
      }
    }
  }
}
