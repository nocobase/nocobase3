import { defineAppRoutes } from '@nocobase/portal-sdk/routing';
import { Boxes, Rocket } from 'lucide-react';

// Set this to false when the application no longer needs the example routes
// contributed by installed Registry extensions. Providers, adapters, and the
// development showcase under /dev remain available.
export const registryRoutesEnabled = false;

// Add application-owned business routes here. Installed Registry extensions
// contribute their own route definitions through the same runtime. Add a
// resource entry when a route should also appear in navigation.
export const appRoutes = defineAppRoutes([
  {
    name: 'apps',
    path: '/apps',
    lazy: () => import('./pages/apps'),
    resource: {
      meta: {
        label: '应用',
        icon: <Boxes />,
        priority: 0,
        description: '查看 Hub 管理的所有 App',
        acl: { type: 'authenticated' },
      },
    },
  },
  {
    name: 'apps.overview',
    path: '/apps/:appId',
    lazy: () => import('./pages/apps/overview'),
  },
  {
    name: 'apps.deployments',
    path: '/apps/:appId/deployments',
    lazy: () => import('./pages/apps/deployments'),
  },
  {
    name: 'apps.resources',
    path: '/apps/:appId/resources',
    lazy: () => import('./pages/apps/resources'),
  },
  {
    name: 'apps.resources.storage',
    path: '/apps/:appId/resources/storage',
    lazy: () => import('./pages/apps/storage'),
  },
  {
    name: 'apps.legacy-settings',
    path: '/apps/:appId/settings',
    lazy: () => import('./pages/apps/settings'),
  },
  {
    name: 'apps.legacy-settings.storage',
    path: '/apps/:appId/settings/storage',
    lazy: () => import('./pages/apps/settings-storage-redirect'),
  },
  {
    name: 'agent-deliveries',
    path: '/deliveries',
    lazy: () => import('./pages/deliveries'),
    resource: {
      meta: {
        label: '版本与发布',
        icon: <Rocket />,
        priority: 1,
        description: '管理 App 版本的审批、上线与回滚',
        acl: { type: 'authenticated' },
      },
    },
  },
  {
    name: 'settings',
    path: '/settings',
    lazy: () => import('./pages/settings'),
  },
  {
    name: 'release-management',
    path: '/deployments',
    lazy: () => import('./pages/deployments'),
  },
]);
