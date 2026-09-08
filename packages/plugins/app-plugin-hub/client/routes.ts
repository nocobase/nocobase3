import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'hub',
    path: '/hub',
    auth: 'required',
    access: { resource: 'hub', action: 'access' },
    componentLoader: () => import('./pages/hub-page.js'),
  },
]);

export default routes;
