import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { KeyRound, ScanSearch, ShieldCheck } from 'lucide-react';

const settings: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'authorization',
    path: '/authorization',
    navigation: { title: 'navigation.authorization', icon: ShieldCheck },
    breadcrumb: { title: 'navigation.authorization' },
    children: [
      {
        name: 'permission-sets',
        path: '/permission-sets',
        navigation: { title: 'navigation.permissionSets', icon: KeyRound },
        breadcrumb: { title: 'navigation.permissionSets' },
        authz: {
          resource: { type: 'settings', id: 'authorization.permission-sets' },
          action: 'read',
        },
        componentLoader: () => import('./pages/permission-sets-page.js'),
        children: [
          {
            name: 'new',
            path: '/new',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.permission-sets',
              },
              action: 'read',
            },
            componentLoader: () => import('./pages/permission-set-new-page.js'),
          },
          {
            name: 'edit',
            path: '/edit/:permissionSetKey',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.permission-sets',
              },
              action: 'read',
            },
            componentLoader: () =>
              import('./pages/permission-set-edit-page.js'),
            children: [
              {
                name: 'assignments',
                path: '/assignments',
                authz: {
                  resource: {
                    type: 'settings',
                    id: 'authorization.permission-sets',
                  },
                  action: 'read',
                },
                componentLoader: () =>
                  import('./pages/permission-set-assignments-page.js'),
              },
              {
                name: 'details',
                path: '/details',
                authz: {
                  resource: {
                    type: 'settings',
                    id: 'authorization.permission-sets',
                  },
                  action: 'read',
                },
                componentLoader: () =>
                  import('./pages/permission-set-details-page.js'),
              },
            ],
          },
        ],
      },
      // The inspector explains whatever the installed plugins decided, so it
      // belongs to none of them and lives beside them rather than under one.
      {
        name: 'inspector',
        path: '/inspector',
        navigation: {
          title: 'navigation.inspector',
          icon: ScanSearch,
          order: 100,
        },
        authz: {
          resource: { type: 'settings', id: 'authorization.inspector' },
          action: 'inspect',
        },
        componentLoader: () => import('./pages/inspector-page.js'),
      },
    ],
  },
]);

export default settings;
