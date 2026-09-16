import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  defaultAccess as rulePlugin,
  type DefaultAccessAuthorizationApi,
  type DefaultAccessStore,
} from '@nocobase/authorization/default-access';
import { DatabaseConnectionHandle } from '@nocobase/app-plugin-authorization/server/management';
import { DatabaseDefaultAccessStore } from './stores/default-access.js';

export interface DefaultAccessOptions {
  store?: DefaultAccessStore<DatabaseConnection>;
}

export function defaultAccess(
  options: DefaultAccessOptions = {},
): AuthorizationPlugin<
  DefaultAccessAuthorizationApi<DatabaseConnection>,
  DatabaseConnection
> {
  const connection = new DatabaseConnectionHandle('DefaultAccess');
  const plugin = rulePlugin<DatabaseConnection>({
    store: options.store ?? new DatabaseDefaultAccessStore(connection.resolve),
  });
  return {
    ...plugin,
    setup(authz) {
      connection.set(authz.connection);
      plugin.setup?.(authz);
      authz.getResource('settings').items.add({
        id: 'authorization.default-access',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-default-access',
        },
        actions: ['read', 'create', 'update', 'delete'],
      });
    },
  };
}
