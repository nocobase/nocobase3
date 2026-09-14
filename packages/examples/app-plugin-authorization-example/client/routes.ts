import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'authorization-example',
      path: '/authorization-example',
      auth: 'required',
      navigation: { title: 'title' },
      componentLoader: () => import('./pages/tasks-page.js'),
    },
  ]),
];
export default routes;
