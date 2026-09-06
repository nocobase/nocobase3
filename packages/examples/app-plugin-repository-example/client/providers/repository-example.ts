import type { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';
export class RepositoryExampleServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-repository-example';
  public override boot(): Promise<void> {
    this.app.refine.addResources([
      {
        name: 'repository-example-find-many',
        list: '/repository-example/find-many',
        meta: {
          parent: 'repository-example-api',
          label: 'findManyTitle',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-aggregate',
        list: '/repository-example/aggregate',
        meta: {
          parent: 'repository-example-api',
          label: 'aggregateTitle',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-api',
        meta: { label: 'apiExamples', i18nNs: this.name },
      },
      {
        name: 'repository-example-atomic',
        list: '/repository-example/atomic',
        meta: {
          parent: 'repository-example-api',
          label: 'atomicTitle',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-crm',
        meta: { label: 'crm', i18nNs: this.name },
      },
      {
        name: 'repository-example-orders',
        meta: { label: 'ordersTitle', i18nNs: this.name },
      },
      {
        name: 'repository-example-customers',
        list: '/repository-example/crm',
        show: '/repository-example/crm/details/:recordId',
        meta: {
          parent: 'repository-example-crm',
          label: 'customers',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-contacts',
        list: '/repository-example/crm/contacts',
        show: '/repository-example/crm/contacts/details/:recordId',
        meta: {
          parent: 'repository-example-crm',
          label: 'contacts',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-order-list',
        list: '/repository-example/orders',
        show: '/repository-example/orders/details/:recordId',
        meta: {
          parent: 'repository-example-orders',
          label: 'orders',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-items',
        list: '/repository-example/orders/items',
        show: '/repository-example/orders/items/details/:recordId',
        meta: {
          parent: 'repository-example-orders',
          label: 'items',
          i18nNs: this.name,
        },
      },
      {
        name: 'repository-example-products',
        list: '/repository-example/orders/products',
        show: '/repository-example/orders/products/details/:recordId',
        meta: {
          parent: 'repository-example-orders',
          label: 'products',
          i18nNs: this.name,
        },
      },
    ]);
    return Promise.resolve();
  }
}
