import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  realtimeServiceToken,
  type RealtimePublicTopic,
  type RealtimeUserTopic,
} from '@nocobase/app-server/realtime';

import { createAppAuthorization } from '../authorization.js';
import {
  authorizationToken,
  protectedPermissionSetRegistryToken,
} from '../tokens.js';
import { createProtectedPermissionSetRegistry } from '../protected-permission-sets.js';
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
  private unregisterSystemAdministratorProtection?: () => void;

  public override register(): void {
    this.app.container.singleton(protectedPermissionSetRegistryToken, () =>
      createProtectedPermissionSetRegistry(),
    );
    this.app.container.singleton(authorizationToken, (container) => {
      const database = container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken)
        : undefined;

      return createAppAuthorization({
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
    });
  }

  public override boot(): Promise<void> {
    this.unregisterSystemAdministratorProtection = this.app.container
      .resolve(protectedPermissionSetRegistryToken)
      .register('@nocobase/app-plugin-authorization', ['system-administrator']);
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
    this.unregisterSystemAdministratorProtection?.();
    this.unregisterSystemAdministratorProtection = undefined;
    return Promise.resolve();
  }
}
