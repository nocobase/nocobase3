import {
  defineSettingsRoutes,
  type AppClientSettingsRoutesContribution,
} from '@nocobase/app-client/plugins';
import { Workflow as WorkflowIcon } from 'lucide-react';

const settings: AppClientSettingsRoutesContribution = defineSettingsRoutes([
  {
    name: 'automation',
    path: '/automation',
    navigation: { title: 'nav.automation', icon: WorkflowIcon },
    children: [
      {
        name: 'workflows',
        path: '/workflows',
        navigation: { title: 'nav.workflows' },
        access: { resource: 'workflow', action: 'access' },
        componentLoader: () =>
          import('./workflow-management/pages.js').then(
            ({ WorkflowListPage }) => ({ default: WorkflowListPage }),
          ),
      },
      {
        name: 'workflow-runs',
        path: '/workflow-runs',
        navigation: { title: 'nav.runs' },
        access: { resource: 'workflow', action: 'access' },
        componentLoader: () =>
          import('./workflow-management/pages.js').then(
            ({ WorkflowRunListPage }) => ({ default: WorkflowRunListPage }),
          ),
      },
    ],
  },
]);

export default settings;
