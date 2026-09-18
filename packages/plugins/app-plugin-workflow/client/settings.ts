import {
  defineSettingsRoutes,
  type AppClientSettingsRoutesContribution,
} from '@nocobase/app-client/plugins';
import { Workflow as WorkflowIcon, Zap } from 'lucide-react';

const settings: AppClientSettingsRoutesContribution = defineSettingsRoutes([
  {
    name: 'automation',
    path: '/automation',
    navigation: { title: 'nav.automation', icon: Zap },
    breadcrumb: { title: 'nav.automation' },
    children: [
      {
        name: 'workflows',
        path: '/workflows',
        navigation: { title: 'nav.workflows', icon: WorkflowIcon },
        breadcrumb: { title: 'nav.workflows' },
        authz: { resource: { type: 'page', id: 'workflow' }, action: 'access' },
        componentLoader: () =>
          import('./workflow-management/pages.js').then(
            ({ WorkflowListPage }) => ({ default: WorkflowListPage }),
          ),
      },
    ],
  },
]);

export default settings;
