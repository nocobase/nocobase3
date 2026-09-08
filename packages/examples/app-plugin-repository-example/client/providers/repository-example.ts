import type { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';
export class RepositoryExampleServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-repository-example';
  public override boot(): Promise<void> {
    this.app.refine.addResources([
      {
        name: 'repository-example-customers',
        list: '/repository-example/crm',
        show: '/repository-example/crm/details/:recordId',
      },
      {
        name: 'repository-example-contacts',
        list: '/repository-example/crm/contacts',
        show: '/repository-example/crm/contacts/details/:recordId',
      },
      {
        name: 'repository-example-order-list',
        list: '/repository-example/orders',
        show: '/repository-example/orders/details/:recordId',
      },
      {
        name: 'repository-example-items',
        list: '/repository-example/orders/items',
        show: '/repository-example/orders/items/details/:recordId',
      },
      {
        name: 'repository-example-products',
        list: '/repository-example/orders/products',
        show: '/repository-example/orders/products/details/:recordId',
      },
    ]);
    return Promise.resolve();
  }
}
