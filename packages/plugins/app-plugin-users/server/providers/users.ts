import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  userManagementServiceToken,
  userRoleScopeRegistryToken,
} from '../tokens.js';
import {
  createUserManagementService,
  createUserRoleScopeRegistry,
} from '../services/users.js';

const USER_ACTIONS = new Set([
  'read',
  'create',
  'update',
  'disable',
  'enable',
  'assign-role',
  'reset-password',
  'revoke-sessions',
]);

export class UsersProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-users';

  public override register(): void {
    this.app.container.singleton(userRoleScopeRegistryToken, () =>
      createUserRoleScopeRegistry(),
    );
    this.app.container.singleton(userManagementServiceToken, (resolver) => {
      const authorization = resolver.resolve(authorizationToken);
      return createUserManagementService({
        database: resolver.resolve(databaseManagerToken),
        users: resolver.resolve(userAdministrationServiceToken),
        roleScopes: resolver.resolve(userRoleScopeRegistryToken),
        onRoleScopesChanged: (userId) =>
          authorization.permissionSets.notifyAssignmentsChanged({
            type: 'user',
            id: userId,
          }),
      });
    });
  }

  public override boot(): Promise<void> {
    const authorization = this.app.container.resolve(authorizationToken);
    authorization.resources.add({
      resourceType: 'user',
      async authorize(request, context) {
        if (!USER_ACTIONS.has(request.action)) {
          return {
            effect: 'deny',
            reasons: [
              {
                code: 'USER_ACTION_NOT_SUPPORTED',
                message: `User authorization does not support action "${request.action}"`,
                plugin: '@nocobase/app-plugin-users',
              },
            ],
          };
        }
        const grants = await context.grants.resolve({
          principal: request.principal,
          subjects: request.subjects,
          resource: request.resource,
          action: request.action,
        });
        const staticGrants = grants.filter(
          (grant) => grant.policy === undefined,
        );
        return staticGrants.length > 0
          ? {
              effect: 'permit',
              reasons: staticGrants.map((grant) => ({
                code: 'USER_ACCESS_GRANTED',
                message: `${grant.source.plugin}:${grant.source.id} allows user access`,
                plugin: '@nocobase/app-plugin-users',
              })),
            }
          : {
              effect: 'deny',
              reasons: [
                {
                  code: 'USER_ACCESS_DENIED',
                  message: 'User access is not allowed',
                  plugin: '@nocobase/app-plugin-users',
                },
              ],
            };
      },
    });
    return Promise.resolve();
  }
}
