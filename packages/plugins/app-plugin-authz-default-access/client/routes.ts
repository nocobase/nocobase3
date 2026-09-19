import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { LockKeyhole } from 'lucide-react';
const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    parent: 'authorization',
    name: 'default-access',
    path: '/default-access',
    navigation: { title: 'navigation.title', icon: LockKeyhole },
    breadcrumb: { title: 'navigation.title' },
    authz: {
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'read',
    },
    componentLoader: () => import('./pages/default-access-page.js'),
  },
]);

export default routes;
