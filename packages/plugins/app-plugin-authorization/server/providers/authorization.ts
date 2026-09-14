import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';
import {
  realtimeServiceToken,
  type RealtimePublicTopic,
  type RealtimeUserTopic,
} from '@nocobase/app-server/realtime';

import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionSetsAuthorizationApi } from '@nocobase/authorization/permissions';

import { createAppAuthorization } from '../authorization.js';
import type { AuthorizationConfig } from '../authorization.js';
import { authorizationToken, permissionSetsToken } from '../tokens.js';
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
  private instance?: Authorization & PermissionSetsAuthorizationApi;
  private permissionsChangedTopic?: RealtimeUserTopic<{
    readonly type: 'permissions-changed';
  }>;
  private globalPermissionsChangedTopic?: RealtimePublicTopic<{
    readonly type: 'permissions-changed';
  }>;

  public override register(): void {
    this.app.container.singleton(authorizationToken, (container) =>
      this.authorization(container),
    );
    this.app.container.singleton(
      permissionSetsToken,
      (container) => this.authorization(container).permissionSets,
    );
  }

  /** Both tokens name one instance, so the provider owns it rather than a binding. */
  private authorization(
    container: ServiceResolver,
  ): Authorization & PermissionSetsAuthorizationApi {
    this.instance ??= createAppAuthorization({
      connection: container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken).connection()
        : undefined,
      config: this.app.config.get<AuthorizationConfig>('authorization'),
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
    return this.instance;
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
