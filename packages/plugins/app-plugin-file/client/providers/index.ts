import { apiClientToken, type ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { ClientFileRepositoryManager } from '../manager.js';
import { clientFileRepositoryManagerToken } from '../token.js';
export class ClientFileRepositoryServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-file';
  public override register(): void {
    this.app.container.singleton(
      clientFileRepositoryManagerToken,
      (container) =>
        new ClientFileRepositoryManager(container.resolve(apiClientToken)),
    );
  }
}
const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  ClientFileRepositoryServiceProvider,
];
export default serviceProviders;
