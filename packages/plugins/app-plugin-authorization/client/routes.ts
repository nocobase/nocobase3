import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import {
  KeyRound,
  LockKeyhole,
  ScanSearch,
  Share2,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';

const settings: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'authorization',
    path: '/authorization',
    navigation: { title: 'navigation.authorization', icon: ShieldCheck },
    children: [
      {
        name: 'permission-sets',
        path: '/permission-sets',
        navigation: { title: 'navigation.permissionSets', icon: KeyRound },
        access: {
          resource: 'settings.authorization.permission-sets',
          action: 'read',
        },
        componentLoader: () => import('./pages/permission-sets-page.js'),
        children: [
          {
            name: 'new',
            path: '/new',
            componentLoader: () => import('./pages/permission-set-new-page.js'),
          },
          {
            name: 'edit',
            path: '/edit/:permissionSetKey',
            componentLoader: () =>
              import('./pages/permission-set-edit-page.js'),
            children: [
              {
                name: 'assignments',
                path: '/assignments',
                componentLoader: () =>
                  import('./pages/permission-set-assignments-page.js'),
              },
              {
                name: 'details',
                path: '/details',
                componentLoader: () =>
                  import('./pages/permission-set-details-page.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'default-access',
        path: '/default-access',
        navigation: { title: 'navigation.defaultAccess', icon: LockKeyhole },
        access: {
          resource: 'settings.authorization.default-access',
          action: 'read',
        },
        componentLoader: () => import('./pages/default-access-page.js'),
      },
      {
        name: 'sharing-rules',
        path: '/sharing-rules',
        navigation: { title: 'navigation.sharingRules', icon: Share2 },
        access: {
          resource: 'settings.authorization.sharing-rules',
          action: 'read',
        },
        componentLoader: () => import('./pages/sharing-rules-page.js'),
      },
      {
        name: 'restriction-rules',
        path: '/restriction-rules',
        navigation: { title: 'navigation.restrictionRules', icon: ShieldBan },
        access: {
          resource: 'settings.authorization.restriction-rules',
          action: 'read',
        },
        componentLoader: () => import('./pages/restriction-rules-page.js'),
      },
      // The inspector explains whatever the installed plugins decided, so it
      // belongs to none of them and lives beside them rather than under one.
      {
        name: 'inspector',
        path: '/inspector',
        navigation: { title: 'navigation.inspector', icon: ScanSearch },
        access: {
          resource: 'settings.authorization.permission-sets',
          action: 'read',
        },
        componentLoader: () => import('./pages/inspector-page.js'),
      },
    ],
  },
]);

export default settings;
