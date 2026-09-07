import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'hub',
    path: '/hub',
    auth: 'required',
    componentLoader: () => import('./pages/hub-page.js'),
  },
]);

export default routes;
