import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'workflow-list',
    path: '/workflow/workflows',
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () => import('./default-pages/workflow-list-page.js'),
  },
  {
    name: 'workflow-detail',
    path: '/workflow/workflows/:workflowId',
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () => import('./default-pages/workflow-detail-page.js'),
  },
  {
    name: 'workflow-run-list',
    path: '/workflow/runs',
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () => import('./default-pages/workflow-run-list-page.js'),
  },
  {
    name: 'workflow-run-detail',
    path: '/workflow/runs/:runId',
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () =>
      import('./default-pages/workflow-run-detail-page.js'),
  },
]);

export default routes;
