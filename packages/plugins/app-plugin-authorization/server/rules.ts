import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  defaultAccess as defaultAccessPlugin,
  type DefaultAccessAuthorizationApi,
  type DefaultAccessStore,
} from '@nocobase/authorization/default-access';
import {
  sharingRules as sharingRulesPlugin,
  type SharingRulesAuthorizationApi,
  type SharingRuleStore,
} from '@nocobase/authorization/sharing-rules';
import {
  restrictionRules as restrictionRulesPlugin,
  type RestrictionRulesAuthorizationApi,
  type RestrictionRuleStore,
} from '@nocobase/authorization/restriction-rules';
import { DatabaseConnectionHandle } from './stores/connection.js';
import { DatabaseDefaultAccessStore } from './stores/default-access.js';
import { DatabaseSharingRuleStore } from './stores/sharing-rules.js';
import { DatabaseRestrictionRuleStore } from './stores/restriction-rules.js';

export interface DefaultAccessOptions {
  /** Replaces the database store this application ships. */
  store?: DefaultAccessStore<DatabaseConnection>;
}

export interface SharingRulesOptions {
  /** Replaces the database store this application ships. */
  store?: SharingRuleStore<DatabaseConnection>;
}

export interface RestrictionRulesOptions {
  /** Replaces the database store this application ships. */
  store?: RestrictionRuleStore<DatabaseConnection>;
}

export function defaultAccess(
  options: DefaultAccessOptions = {},
): AuthorizationPlugin<
  DefaultAccessAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('Default Access');
  const plugin = defaultAccessPlugin<DatabaseConnection>({
    store: options.store ?? new DatabaseDefaultAccessStore(connection.resolve),
  });
  return withConnection(plugin, connection);
}

export function sharingRules(
  options: SharingRulesOptions = {},
): AuthorizationPlugin<
  SharingRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('Sharing Rules');
  const plugin = sharingRulesPlugin<DatabaseConnection>({
    store: options.store ?? new DatabaseSharingRuleStore(connection.resolve),
  });
  return withConnection(plugin, connection);
}

export function restrictionRules(
  options: RestrictionRulesOptions = {},
): AuthorizationPlugin<
  RestrictionRulesAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('Restriction Rules');
  const plugin = restrictionRulesPlugin<DatabaseConnection>({
    store:
      options.store ?? new DatabaseRestrictionRuleStore(connection.resolve),
  });
  return withConnection(plugin, connection);
}

/** Hands the connection to the store once Authorization runs the plugin's setup. */
function withConnection<TApi extends object>(
  plugin: AuthorizationPlugin<TApi>,
  connection: DatabaseConnectionHandle,
): AuthorizationPlugin<TApi, DatabaseConnection> {
  return {
    ...plugin,
    setup(authz): void {
      connection.set(authz.connection);
      plugin.setup?.(authz);
    },
  };
}
