import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'authorization-example',
      auth: 'required',
      navigation: { title: 'title' },
      children: [
        {
          name: 'authorization-example-overview',
          path: '/authorization-example',
          authz: 'skip',
          navigation: { title: 'overview' },
          componentLoader: () => import('./pages/overview-page.js'),
        },
        {
          name: 'authorization-example-projects',
          path: '/authorization-example/projects',
          authz: {
            resource: { type: 'page', id: 'example.sales.projects' },
            action: 'access',
          },
          navigation: { title: 'sales.projects' },
          componentLoader: () => import('./pages/projects-page.js'),
        },
        {
          name: 'authorization-example-quotes',
          path: '/authorization-example/quotes',
          authz: {
            resource: { type: 'page', id: 'example.sales.quotes' },
            action: 'access',
          },
          navigation: { title: 'sales.quotes' },
          componentLoader: () => import('./pages/quotes-page.js'),
        },
        {
          name: 'authorization-example-orders',
          path: '/authorization-example/orders',
          authz: {
            resource: { type: 'page', id: 'example.sales.orders' },
            action: 'access',
          },
          navigation: { title: 'sales.orders' },
          componentLoader: () => import('./pages/orders-page.js'),
        },
      ],
    },
  ]),
];
export default routes;
