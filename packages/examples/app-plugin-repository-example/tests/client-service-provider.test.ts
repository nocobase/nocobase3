import { describe, expect, it, vi } from 'vitest';

import { RepositoryExampleServiceProvider } from '../client/providers/repository-example.js';
import serviceProviders from '../client/providers/index.js';

describe('@nocobase/app-plugin-repository-example', () => {
  it('preserves CRUD list and detail targets without registering menu resources', async () => {
    const addResources = vi.fn();
    const provider = new RepositoryExampleServiceProvider({
      refine: { addResources },
    } as never);
    await provider.boot();
    expect(addResources).toHaveBeenCalledWith([
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
  });

  it('declares its Client ServiceProvider', () => {
    expect(serviceProviders).toHaveLength(1);
    expect(serviceProviders[0]).toBeTypeOf('function');
  });
});
