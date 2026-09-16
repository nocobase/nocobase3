import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { ShieldBan } from 'lucide-react';
const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    parent: 'authorization',
    name: 'restriction-rules',
    path: '/restriction-rules',
    navigation: { title: 'navigation.title', icon: ShieldBan },
    breadcrumb: { title: 'navigation.title' },
    access: {
      resource: 'settings.authorization.restriction-rules',
      action: 'read',
    },
    componentLoader: () => import('./pages/restriction-rules-page.js'),
  },
]);

export default routes;
