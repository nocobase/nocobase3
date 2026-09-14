import { databaseManagerToken } from '@nocobase/db';
import {
  authorizationToken,
  permissionSetsToken,
} from '@nocobase/app-plugin-authorization';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import type { DatabaseConnection } from '@nocobase/db';
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

/** The cap `UserAdministrationService.list` applies to a page. */
const ACCOUNT_PAGE_SIZE = 100;

export class UsersProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-users';
  private releaseSubjectType?: () => void;

  public override register(): void {
    this.app.container.singleton(userRoleScopeRegistryToken, () =>
      createUserRoleScopeRegistry(),
    );
    this.app.container.singleton(userManagementServiceToken, (resolver) => {
      // An application may be assembled without authorization; user
      // management still works, it just has no assignments to protect.
      const permissionSets = resolver.has(permissionSetsToken)
        ? resolver.resolve(permissionSetsToken)
        : undefined;
      return createUserManagementService({
        database: resolver.resolve(databaseManagerToken),
        users: resolver.resolve(userAdministrationServiceToken),
        roleScopes: resolver.resolve(userRoleScopeRegistryToken),
        ...(permissionSets === undefined ? {} : { permissionSets }),
        onRoleScopesChanged: (userId) =>
          permissionSets?.notifyAssignmentsChanged({
            type: 'user',
            id: userId,
          }),
      });
    });
  }

  public override boot(): Promise<void> {
    // An application may be assembled without authorization.
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization = this.app.container.resolve(authorizationToken);
    // A disabled account can no longer act, so it holds nothing any more.
    this.releaseSubjectType = authorization.subjects.define<DatabaseConnection>(
      'user',
      {
        filterActive: (ids, connection) => this.enabledUserIds(ids, connection),
      },
    );
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

  public override shutdown(): Promise<void> {
    this.releaseSubjectType?.();
    this.releaseSubjectType = undefined;
    return Promise.resolve();
  }

  /**
   * Asks this plugin's own user administration which of these accounts are
   * still enabled, one page per batch rather than one query per account.
   */
  private async enabledUserIds(
    ids: readonly string[],
    connection?: DatabaseConnection,
  ): Promise<readonly string[]> {
    const service = this.app.container.resolve(userAdministrationServiceToken);
    const users = connection ? service.withConnection(connection) : service;
    const enabled: string[] = [];
    for (let start = 0; start < ids.length; start += ACCOUNT_PAGE_SIZE) {
      const page = await users.list({
        userIds: ids.slice(start, start + ACCOUNT_PAGE_SIZE),
        status: 'enabled',
        pageSize: ACCOUNT_PAGE_SIZE,
      });
      enabled.push(...page.items.map((user) => user.id));
    }
    return enabled;
  }
}
