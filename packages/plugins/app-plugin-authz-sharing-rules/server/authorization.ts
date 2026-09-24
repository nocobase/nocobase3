import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuthorizationPlugin,
  BusinessAuthorizationApi,
} from '@nocobase/authorization/core';
import {
  sharingRulesPlugin,
  type SharingRulesAuthorizationApi,
  type SharingRuleStore,
} from '@nocobase/authorization/sharing-rules';
import type {
  DatabaseAuthorizationApi,
  SettingsAuthorizationApi,
} from '@nocobase/app-plugin-authorization/server';
import { DatabaseConnectionHandle } from '@nocobase/app-plugin-authorization/server/extension';
import {
  createSharingRulesHandler,
  SHARING_RULES_RULE,
  SHARING_RULES_SETTINGS,
} from './handler.js';
import { DatabaseSharingRuleStore } from './stores/sharing-rules.js';

const NAMESPACE = '@nocobase/app-plugin-authz-sharing-rules';
const APP_NAMESPACE = '@nocobase/app-plugin-authorization';

export interface SharingRulesOptions {
  store?: SharingRuleStore<DatabaseConnection>;
}

/** The configuration factory: sharing rules with their settings item and routes. */
export function sharingRules(
  options: SharingRulesOptions = {},
): AuthorizationPlugin<
  SharingRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection,
  SettingsAuthorizationApi & DatabaseAuthorizationApi & BusinessAuthorizationApi
> {
  const connection = new DatabaseConnectionHandle('Sharing Rules');
  const plugin = sharingRulesPlugin<DatabaseConnection>({
    store: options.store ?? new DatabaseSharingRuleStore(connection.resolve),
  });
  return {
    ...plugin,
    dependencies: ['settings', 'database', 'business'],
    setup(authz) {
      connection.set(authz.connection);
      plugin.setup?.(authz);
      authz.settings.add({
        id: SHARING_RULES_SETTINGS,
        title: { key: 'resourceTitle', ns: NAMESPACE },
        group: 'authorization',
        actions: ['read', 'create', 'update', 'delete'].map((name) => ({
          name,
          title: { key: `options.actions.${name}`, ns: APP_NAMESPACE },
        })),
      });
      authz.routes.add(
        `/${SHARING_RULES_RULE}`,
        createSharingRulesHandler(authz, plugin.authorizationApi!.sharingRules),
      );
    },
  };
}
