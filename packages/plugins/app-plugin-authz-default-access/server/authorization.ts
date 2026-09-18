import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  defaultAccess as rulePlugin,
  type DefaultAccessAuthorizationApi,
  type DefaultAccessStore,
} from '@nocobase/authorization/default-access';
import {
  DatabaseConnectionHandle,
  settingsApi,
} from '@nocobase/app-plugin-authorization/server/management';
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
      authz.resources.add({
        name: 'authorization.default-access',
        group: 'authorization',
        title: {
          key: 'resourceTitle',
          ns: '@nocobase/app-plugin-authz-default-access',
        },
        actions: [
          {
            name: 'read',
            title: {
              key: 'options.actions.read',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.default-access', ['read']),
            ],
          },
          {
            name: 'configure',
            title: {
              key: 'options.actions.configure',
              ns: '@nocobase/app-plugin-authorization',
            },
            grants: [
              settingsApi.grant('authorization.default-access', ['configure']),
            ],
          },
        ],
      });
    },
  };
}
