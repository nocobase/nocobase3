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
          access: false,
          navigation: { title: 'overview' },
          componentLoader: () => import('./pages/overview-page.js'),
        },
        {
          name: 'authorization-example-projects',
          path: '/authorization-example/projects',
          access: { resource: 'page:example.sales.projects', action: 'access' },
          navigation: { title: 'sales.projects' },
          componentLoader: () => import('./pages/projects-page.js'),
        },
        {
          name: 'authorization-example-quotes',
          path: '/authorization-example/quotes',
          access: { resource: 'page:example.sales.quotes', action: 'access' },
          navigation: { title: 'sales.quotes' },
          componentLoader: () => import('./pages/quotes-page.js'),
        },
        {
          name: 'authorization-example-orders',
          path: '/authorization-example/orders',
          access: { resource: 'page:example.sales.orders', action: 'access' },
          navigation: { title: 'sales.orders' },
          componentLoader: () => import('./pages/orders-page.js'),
        },
      ],
    },
  ]),
];
export default routes;
