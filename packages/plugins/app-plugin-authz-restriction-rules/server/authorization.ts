import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  restrictionRules as rulePlugin,
  type RestrictionRulesAuthorizationApi,
  type RestrictionRuleStore,
} from '@nocobase/authorization/restriction-rules';
import { DatabaseConnectionHandle } from '@nocobase/app-plugin-authorization/server/management';
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
      authz.getResource('settings').items.add({
        id: 'authorization.restriction-rules',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-restriction-rules',
        },
        actions: ['read', 'create', 'update', 'delete'],
      });
    },
  };
}
