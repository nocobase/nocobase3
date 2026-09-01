import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'hub.applications',
    path: '/apps',
    auth: 'required',
    componentLoader: () => import('./pages/applications-page.js'),
  },
  {
    name: 'hub.application-detail',
    path: '/apps/:appId',
    auth: 'required',
    componentLoader: () => import('./pages/application-detail-page.js'),
  },
  {
    name: 'hub.deployments',
    path: '/deployments',
    auth: 'required',
    componentLoader: () => import('./pages/deployments-page.js'),
  },
  {
    name: 'hub.deployment-detail',
    path: '/deployments/:deploymentId',
    auth: 'required',
    componentLoader: () => import('./pages/deployment-detail-page.js'),
  },
  {
    name: 'hub.audit',
    path: '/audit',
    auth: 'required',
    componentLoader: () => import('./pages/audit-page.js'),
  },
  {
    name: 'hub.members',
    path: '/members',
    auth: 'required',
    componentLoader: () => import('./pages/members-page.js'),
  },
]);

export default routes;
