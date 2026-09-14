import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  realtimeServiceToken,
  type RealtimePublicTopic,
  type RealtimeUserTopic,
} from '@nocobase/app-server/realtime';

import { createAppAuthorization } from '../authorization.js';
import { authorizationToken } from '../tokens.js';
import {
  AUTHORIZATION_GLOBAL_PERMISSIONS_CHANGED_TOPIC,
  AUTHORIZATION_PERMISSIONS_CHANGED_TOPIC,
} from '../../shared.js';

export type AuthorizationProviderApplication = AppPluginApplication;

export class AuthorizationProvider<
  TApplication extends AuthorizationProviderApplication =
    AuthorizationProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-authorization';
  private permissionsChangedTopic?: RealtimeUserTopic<{
    readonly type: 'permissions-changed';
  }>;
  private globalPermissionsChangedTopic?: RealtimePublicTopic<{
    readonly type: 'permissions-changed';
  }>;

  public override register(): void {
    this.app.container.singleton(authorizationToken, (container) => {
      const database = container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken)
        : undefined;

      const authorization = createAppAuthorization({
        connection: database?.connection(),
        onUserPermissionsChanged: (userId) => {
          this.permissionsChangedTopic?.publishFor(userId, {
            type: 'permissions-changed',
          });
        },
        onAuthenticatedPermissionsChanged: () => {
          this.globalPermissionsChangedTopic?.publish({
            type: 'permissions-changed',
          });
        },
      });
      // The System Administrator set is code-owned: the generic management
      // API may assign and revoke administrators but never edit or delete the
      // set. It lives as long as the instance, so nothing needs to release it.
      // Its last assignment that can still act stays in place, because nobody
      // else could restore it. Holding it grants unrestricted access, which is
      // a bypass rather than an enumerated grant list, so it never goes stale
      // when a new resource type or action appears.
      authorization.permissionSets.protect({
        owner: '@nocobase/app-plugin-authorization',
        keys: ['system-administrator'],
        allow: ['assign', 'revoke'],
        requireActiveAssignment: true,
        unrestricted: true,
      });
      // The baseline role every signed-in user holds. Its grants stay
      // editable; the set itself and its authenticated:* binding do not.
      authorization.permissionSets.protect({
        owner: '@nocobase/app-plugin-authorization',
        keys: ['authenticated'],
        allow: ['update'],
      });
      return authorization;
    });
  }

  public override boot(): Promise<void> {
    if (this.app.container.has(realtimeServiceToken)) {
      this.permissionsChangedTopic = this.app.container
        .resolve(realtimeServiceToken)
        .defineTopic(AUTHORIZATION_PERMISSIONS_CHANGED_TOPIC, {
          audience: 'user',
        });
      this.globalPermissionsChangedTopic = this.app.container
        .resolve(realtimeServiceToken)
        .defineTopic(AUTHORIZATION_GLOBAL_PERMISSIONS_CHANGED_TOPIC, {
          audience: 'public',
        });
    }
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.permissionsChangedTopic?.close();
    this.permissionsChangedTopic = undefined;
    this.globalPermissionsChangedTopic?.close();
    this.globalPermissionsChangedTopic = undefined;
    return Promise.resolve();
  }
}
