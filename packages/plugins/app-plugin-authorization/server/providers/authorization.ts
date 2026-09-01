import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { createAppAuthorization } from '../authorization.js';
import { authorizationToken } from '../tokens.js';

export type AuthorizationProviderApplication = AppPluginApplication;

export class AuthorizationProvider<
  TApplication extends AuthorizationProviderApplication =
    AuthorizationProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-authorization';

  public override register(): void {
    this.app.container.singleton(authorizationToken, (container) => {
      const database = container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken)
        : undefined;

      return createAppAuthorization({
        connection: database?.connection(),
      });
    });
  }
}
