import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { databaseManagerToken } from '@nocobase/app-database';
import { ServiceProvider } from '@nocobase/service-provider';

import { createAppAuthorization } from './authorization.js';
import { authorizationToken } from './token.js';

export default class AuthorizationProvider<
  TConfig = unknown,
> extends ServiceProvider<AppRuntime<TConfig>> {
  public readonly name: string = '@nocobase/app-plugin-authorization';

  public override register(): void {
    this.context.serviceContainer.singleton(authorizationToken, (services) => {
      const database = services.has(databaseManagerToken)
        ? services.resolve(databaseManagerToken)
        : undefined;

      return createAppAuthorization({
        connection: database?.connection(),
      });
    });
  }
}
