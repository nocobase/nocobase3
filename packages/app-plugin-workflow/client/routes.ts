import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { WORKFLOW_SETTING_PATHS } from './route-contracts.js';
import settings from './settings.js';

const appRoutes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'workflow-detail',
    path: `${WORKFLOW_SETTING_PATHS.workflows}/:workflowId`,
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () =>
      import('./workflow-management/pages.js').then(
        ({ WorkflowDetailPage }) => ({ default: WorkflowDetailPage }),
      ),
  },
  {
    name: 'workflow-run-detail',
    path: `${WORKFLOW_SETTING_PATHS.workflowRuns}/:runId`,
    access: { resource: 'workflow', action: 'access' },
    componentLoader: () =>
      import('./workflow-management/pages.js').then(
        ({ WorkflowRunDetailPage }) => ({ default: WorkflowRunDetailPage }),
      ),
  },
]);

const routes: readonly AppClientRouteContribution[] = [settings, appRoutes];

export default routes;
