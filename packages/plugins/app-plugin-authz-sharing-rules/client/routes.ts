import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Share2 } from 'lucide-react';
const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    parent: 'authorization',
    name: 'sharing-rules',
    path: '/sharing-rules',
    navigation: { title: 'navigation.title', icon: Share2 },
    breadcrumb: { title: 'navigation.title' },
    access: {
      resource: 'settings.authorization.sharing-rules',
      action: 'read',
    },
    componentLoader: () => import('./pages/sharing-rules-page.js'),
  },
]);

export default routes;
