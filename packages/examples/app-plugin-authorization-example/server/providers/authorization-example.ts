import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerSalesAuthorization } from '../sales-authorization.js';
import { NS } from '../../catalog.js';
export class AuthorizationExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = NS;
  public override async boot(): Promise<void> {
    registerSalesAuthorization(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(databaseManagerToken),
    );
  }
}
