import {
  defineDevRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineDevRoutes([
    {
      name: 'file-repository',
      path: '/file-repository',
      navigation: { title: 'File Repository' },
      componentLoader: () => import('./pages/attachments.js'),
    },
  ]),
];
export default routes;
