import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuthorizationPlugin,
  BusinessAuthorizationApi,
} from '@nocobase/authorization/core';
import {
  restrictionRulesPlugin,
  type RestrictionRulesAuthorizationApi,
  type RestrictionRuleStore,
} from '@nocobase/authorization/restriction-rules';
import type {
  DatabaseAuthorizationApi,
  SettingsAuthorizationApi,
} from '@nocobase/app-plugin-authorization/server';
import { DatabaseConnectionHandle } from '@nocobase/app-plugin-authorization/server/extension';
import {
  createRestrictionRulesHandler,
  RESTRICTION_RULES_RULE,
  RESTRICTION_RULES_SETTINGS,
} from './handler.js';
import { DatabaseRestrictionRuleStore } from './stores/restriction-rules.js';

const NAMESPACE = '@nocobase/app-plugin-authz-restriction-rules';
const APP_NAMESPACE = '@nocobase/app-plugin-authorization';

export interface RestrictionRulesOptions {
  store?: RestrictionRuleStore<DatabaseConnection>;
}

/** The configuration factory: sharing rules with their settings item and routes. */
export function restrictionRules(
  options: RestrictionRulesOptions = {},
): AuthorizationPlugin<
  RestrictionRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection,
  SettingsAuthorizationApi & DatabaseAuthorizationApi & BusinessAuthorizationApi
> {
  const connection = new DatabaseConnectionHandle('Restriction Rules');
  const plugin = restrictionRulesPlugin<DatabaseConnection>({
    store:
      options.store ?? new DatabaseRestrictionRuleStore(connection.resolve),
  });
  return {
    ...plugin,
    dependencies: ['settings', 'database', 'business'],
    setup(authz) {
      connection.set(authz.connection);
      plugin.setup?.(authz);
      authz.settings.add({
        id: RESTRICTION_RULES_SETTINGS,
        title: { key: 'resourceTitle', ns: NAMESPACE },
        section: 'authorization',
        actions: ['read', 'create', 'update', 'delete'].map((name) => ({
          name,
          title: { key: `options.actions.${name}`, ns: APP_NAMESPACE },
        })),
      });
      authz.routes.add(
        `/${RESTRICTION_RULES_RULE}`,
        createRestrictionRulesHandler(
          authz,
          plugin.authorizationApi!.restrictionRules,
        ),
      );
    },
  };
}
