import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  sharingRules as rulePlugin,
  type SharingRulesAuthorizationApi,
  type SharingRuleStore,
} from '@nocobase/authorization/sharing-rules';
import { DatabaseConnectionHandle } from '@nocobase/app-plugin-authorization/server/management';
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
      authz.getResource('settings').items.add({
        id: 'authorization.sharing-rules',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-sharing-rules',
        },
        actions: ['read', 'create', 'update', 'delete'],
      });
    },
  };
}
