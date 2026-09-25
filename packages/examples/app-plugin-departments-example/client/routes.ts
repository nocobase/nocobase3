import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Building2, Network } from 'lucide-react';

import { DIRECTORY_PAGE, ORGANIZATION_SETTINGS } from './constants.js';

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'organization',
    path: '/organization',
    navigation: { title: 'navigation.organization', icon: Network },
    authz: {
      resource: { type: 'settings', id: ORGANIZATION_SETTINGS },
      action: 'read',
    },
    componentLoader: () => import('./pages/settings/organization/index.js'),
    children: [
      {
        // The path the department subject type's `manage` returns; it inherits the entry page's `authz`.
        name: 'organizationDepartment',
        path: 'departments/:departmentId',
        componentLoader: () =>
          import('./pages/settings/organization/department.js'),
      },
    ],
  },
]);

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'departmentDirectory',
    path: '/department-directory',
    auth: 'required',
    navigation: { title: 'navigation.directory', icon: Building2 },
    authz: { resource: { type: 'page', id: DIRECTORY_PAGE }, action: 'access' },
    componentLoader: () => import('./pages/directory.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
