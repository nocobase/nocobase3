import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { WORKFLOW_ROUTE_IDS } from '@nocobase/app-plugin-workflow/client';

const workflowManagementExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-workflow-management',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: WORKFLOW_ROUTE_IDS.workflowList,
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        componentLoader: () =>
          import('./pages').then(({ WorkflowListPage }) => ({
            default: WorkflowListPage,
          })),
      },
      {
        routeId: WORKFLOW_ROUTE_IDS.workflowDetail,
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        componentLoader: () =>
          import('./pages').then(({ WorkflowDetailPage }) => ({
            default: WorkflowDetailPage,
          })),
      },
      {
        routeId: WORKFLOW_ROUTE_IDS.workflowRunList,
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        componentLoader: () =>
          import('./pages').then(({ WorkflowRunListPage }) => ({
            default: WorkflowRunListPage,
          })),
      },
      {
        routeId: WORKFLOW_ROUTE_IDS.workflowRunDetail,
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        componentLoader: () =>
          import('./pages').then(({ WorkflowRunDetailPage }) => ({
            default: WorkflowRunDetailPage,
          })),
      },
    ]),
  });

export default workflowManagementExtension;
