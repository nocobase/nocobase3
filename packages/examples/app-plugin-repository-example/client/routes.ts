import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'find-many',
      path: '/repository-example/find-many',
      auth: 'required',
      componentLoader: () => import('./pages/find-many-page.js'),
    },
    {
      name: 'aggregate',
      path: '/repository-example/aggregate',
      auth: 'required',
      componentLoader: () => import('./pages/aggregate-page.js'),
    },
    {
      name: 'atomic',
      path: '/repository-example/atomic',
      auth: 'required',
      componentLoader: () => import('./pages/atomic-page.js'),
    },
    {
      name: 'crm',
      path: '/repository-example/crm',
      auth: 'required',
      componentLoader: () => import('./pages/crm-page.js'),
    },
    {
      name: 'orders',
      path: '/repository-example/orders',
      auth: 'required',
      componentLoader: () => import('./pages/orders-page.js'),
    },
    {
      name: 'contacts',
      path: '/repository-example/crm/contacts',
      auth: 'required',
      componentLoader: () => import('./pages/contacts-page.js'),
    },
    {
      name: 'items',
      path: '/repository-example/orders/items',
      auth: 'required',
      componentLoader: () => import('./pages/items-page.js'),
    },
    {
      name: 'products',
      path: '/repository-example/orders/products',
      auth: 'required',
      componentLoader: () => import('./pages/products-page.js'),
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
