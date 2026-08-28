import { databaseManagerToken } from '@nocobase/app-database';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { createAppAuthorization } from './authorization.js';
import { authorizationToken } from './token.js';

export interface AuthorizationProviderApplication {
  readonly container: ServiceContainer;
}

export default class AuthorizationProvider<
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
