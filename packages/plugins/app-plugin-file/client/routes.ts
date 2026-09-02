import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Files } from 'lucide-react';

const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'files',
    path: '/files',
    navigation: { title: 'inventory.nav', icon: Files },
    componentLoader: () => import('./pages/file-inventory-page.js'),
  },
]);

export default routes;
