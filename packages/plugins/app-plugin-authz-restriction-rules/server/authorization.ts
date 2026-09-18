import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  restrictionRules as rulePlugin,
  type RestrictionRulesAuthorizationApi,
  type RestrictionRuleStore,
} from '@nocobase/authorization/restriction-rules';
import {
  DatabaseConnectionHandle,
  settingsApi,
} from '@nocobase/app-plugin-authorization/server/management';
import { DatabaseRestrictionRuleStore } from './stores/restriction-rules.js';

export interface RestrictionRulesOptions {
  store?: RestrictionRuleStore<DatabaseConnection>;
}

export function restrictionRules(
  options: RestrictionRulesOptions = {},
): AuthorizationPlugin<
  RestrictionRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('RestrictionRules');
  const plugin = rulePlugin<DatabaseConnection>({
    store:
      options.store ?? new DatabaseRestrictionRuleStore(connection.resolve),
  });
  return {
    ...plugin,
    setup(authz) {
      connection.set(authz.connection);
      plugin.setup?.(authz);
      authz.resources.add({
        name: 'authorization.restriction-rules',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-restriction-rules',
        },
        actions: [
          {
            name: 'read',
            title: {
              key: 'options.actions.read',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.restriction-rules', ['read']),
            ],
          },
          {
            name: 'create',
            title: {
              key: 'options.actions.create',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.restriction-rules', ['create']),
            ],
          },
          {
            name: 'update',
            title: {
              key: 'options.actions.update',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.restriction-rules', ['update']),
            ],
          },
          {
            name: 'delete',
            title: {
              key: 'options.actions.delete',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.restriction-rules', ['delete']),
            ],
          },
        ],
      });
    },
  };
}
