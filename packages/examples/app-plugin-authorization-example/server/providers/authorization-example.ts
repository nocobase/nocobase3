import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { registerSalesAuthorization } from '../sales-authorization.js';
import { registerSalesTeams } from '../sales-teams.js';
import { NS } from '../../catalog.js';
export class AuthorizationExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = NS;
  private releaseTeams?: () => void;
  public override async boot(): Promise<void> {
    this.releaseTeams = registerSalesTeams(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(databaseManagerToken),
    );
    registerSalesAuthorization(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(databaseManagerToken),
    );
  }
  public override async shutdown(): Promise<void> {
    this.releaseTeams?.();
  }
}
