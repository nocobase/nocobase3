import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'api-examples',
      navigation: { title: 'apiExamples' },
      children: [
        {
          name: 'sort',
          path: '/repository-example/sort',
          auth: 'required',
          navigation: { title: 'sortTitle' },
          componentLoader: () => import('./pages/sort-page.js'),
        },
        {
          name: 'select-combine',
          path: '/repository-example/select-combine',
          auth: 'required',
          navigation: { title: 'selectCombineTitle' },
          componentLoader: () => import('./pages/select-combine-page.js'),
        },
        {
          name: 'relation-mutations',
          path: '/repository-example/relation-mutations',
          auth: 'required',
          navigation: { title: 'relationMutationsTitle' },
          componentLoader: () => import('./pages/relation-mutations-page.js'),
        },
        {
          name: 'find-many',
          path: '/repository-example/find-many',
          auth: 'required',
          navigation: { title: 'findManyTitle' },
          componentLoader: () => import('./pages/find-many-page.js'),
        },
        {
          name: 'aggregate',
          path: '/repository-example/aggregate',
          auth: 'required',
          navigation: { title: 'aggregateTitle' },
          componentLoader: () => import('./pages/aggregate-page.js'),
        },
        {
          name: 'atomic',
          path: '/repository-example/atomic',
          auth: 'required',
          navigation: { title: 'atomicTitle' },
          componentLoader: () => import('./pages/atomic-page.js'),
        },
      ],
    },
    {
      name: 'crm-group',
      navigation: { title: 'crm' },
      children: [
        {
          name: 'crm',
          path: '/repository-example/crm',
          auth: 'required',
          navigation: { title: 'customers' },
          componentLoader: () => import('./pages/crm-page.js'),
        },
        {
          name: 'contacts',
          path: '/repository-example/crm/contacts',
          auth: 'required',
          navigation: { title: 'contacts' },
          componentLoader: () => import('./pages/contacts-page.js'),
        },
      ],
    },
    {
      name: 'orders-group',
      navigation: { title: 'ordersTitle' },
      children: [
        {
          name: 'orders',
          path: '/repository-example/orders',
          auth: 'required',
          navigation: { title: 'orders' },
          componentLoader: () => import('./pages/orders-page.js'),
        },
        {
          name: 'items',
          path: '/repository-example/orders/items',
          auth: 'required',
          navigation: { title: 'items' },
          componentLoader: () => import('./pages/items-page.js'),
        },
        {
          name: 'products',
          path: '/repository-example/orders/products',
          auth: 'required',
          navigation: { title: 'products' },
          componentLoader: () => import('./pages/products-page.js'),
        },
      ],
    },
    {
      name: 'crm-detail',
      path: '/repository-example/crm/details/:recordId',
      auth: 'required',
      componentLoader: () => import('./pages/crm-page.js'),
    },
    {
      name: 'orders-detail',
      path: '/repository-example/orders/details/:recordId',
      auth: 'required',
      componentLoader: () => import('./pages/orders-page.js'),
    },
    {
      name: 'contacts-detail',
      path: '/repository-example/crm/contacts/details/:recordId',
      auth: 'required',
      componentLoader: () => import('./pages/contacts-page.js'),
    },
    {
      name: 'items-detail',
      path: '/repository-example/orders/items/details/:recordId',
      auth: 'required',
      componentLoader: () => import('./pages/items-page.js'),
    },
    {
      name: 'products-detail',
      path: '/repository-example/orders/products/details/:recordId',
      auth: 'required',
      componentLoader: () => import('./pages/products-page.js'),
    },
  ]),
];
export default routes;
