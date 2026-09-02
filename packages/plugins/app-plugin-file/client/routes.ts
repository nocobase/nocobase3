import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Files } from 'lucide-react';

import { FILE_INVENTORY_RESOURCE } from '../shared/inventory.js';

const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'files',
    path: '/files',
    navigation: { title: 'inventory.nav', icon: Files },
    access: { resource: FILE_INVENTORY_RESOURCE, action: 'access' },
    componentLoader: () => import('./pages/file-inventory-page.js'),
  },
]);

export default routes;
