import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Network } from 'lucide-react';

import { DEPARTMENTS_SETTINGS } from './constants.js';

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'departments',
    path: '/departments',
    navigation: { title: 'navigation.departments', icon: Network },
    authz: {
      resource: { type: 'settings', id: DEPARTMENTS_SETTINGS },
      action: 'read',
    },
    componentLoader: () => import('./pages/settings/departments/index.js'),
    children: [
      {
        // One department's details; it inherits the entry page's `authz`.
        name: 'department',
        path: ':departmentId',
        componentLoader: () =>
          import('./pages/settings/departments/department.js'),
      },
    ],
  },
]);

const routes: readonly AppClientRouteContribution[] = [settingsRoutes];

export default routes;
