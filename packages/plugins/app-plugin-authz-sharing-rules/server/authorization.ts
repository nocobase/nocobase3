import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  sharingRules as rulePlugin,
  type SharingRulesAuthorizationApi,
  type SharingRuleStore,
} from '@nocobase/authorization/sharing-rules';
import {
  DatabaseConnectionHandle,
  settingsApi,
} from '@nocobase/app-plugin-authorization/server/management';
import { DatabaseSharingRuleStore } from './stores/sharing-rules.js';

export interface SharingRulesOptions {
  store?: SharingRuleStore<DatabaseConnection>;
}

export function sharingRules(
  options: SharingRulesOptions = {},
): AuthorizationPlugin<
  SharingRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('SharingRules');
  const plugin = rulePlugin<DatabaseConnection>({
    store: options.store ?? new DatabaseSharingRuleStore(connection.resolve),
  });
  return {
    ...plugin,
    setup(authz) {
      connection.set(authz.connection);
      plugin.setup?.(authz);
      authz.resources.add({
        name: 'authorization.sharing-rules',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-sharing-rules',
        },
        actions: [
          {
            name: 'read',
            title: {
              key: 'options.actions.read',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.sharing-rules', ['read']),
            ],
          },
          {
            name: 'create',
            title: {
              key: 'options.actions.create',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.sharing-rules', ['create']),
            ],
          },
          {
            name: 'update',
            title: {
              key: 'options.actions.update',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.sharing-rules', ['update']),
            ],
          },
          {
            name: 'delete',
            title: {
              key: 'options.actions.delete',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.sharing-rules', ['delete']),
            ],
          },
        ],
      });
    },
  };
}
