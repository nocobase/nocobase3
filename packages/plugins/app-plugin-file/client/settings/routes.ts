import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Files } from 'lucide-react';

import { FILE_INVENTORY_RESOURCE } from '../../shared/settings/inventory.js';

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'files',
    path: '/files',
    navigation: { title: 'inventory.nav', icon: Files },
    access: { resource: FILE_INVENTORY_RESOURCE, action: 'access' },
    componentLoader: () => import('./file-inventory-page.js'),
  },
]);

export default settingsRoutes;
