import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
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

import {
  createAppAuthorization,
  type AppAuthorization,
  type AuthorizationConfig,
} from '../authorization.js';
import { authorizationToken } from '../tokens.js';
import { reportAuthorizationUi } from '../ui.js';
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
  private instance?: AppAuthorization;
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
  }

  private authorization(container: ServiceResolver): AppAuthorization {
    this.instance ??= createAppAuthorization({
      database: container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken)
        : undefined,
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

  /**
   * Every provider has booted, so every plugin has placed its resources:
   * check the workspace placements once. Errors throw in development and are
   * logged in production.
   */
  public override async start(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const logger = this.app.container.has(loggingToken)
      ? this.app.container.resolve(loggingToken).getLogger('authorization')
      : undefined;
    reportAuthorizationUi(authz.ui.validate(authz), {
      production: process.env.NODE_ENV === 'production',
      warn: (message) => {
        if (logger) logger.warn(message);
        else console.warn(message);
      },
    });
  }

  public override shutdown(): Promise<void> {
    this.permissionsChangedTopic?.close();
    this.permissionsChangedTopic = undefined;
    this.globalPermissionsChangedTopic?.close();
    this.globalPermissionsChangedTopic = undefined;
    return Promise.resolve();
  }
}
