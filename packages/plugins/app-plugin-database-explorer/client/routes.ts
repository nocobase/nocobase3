import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Database } from 'lucide-react';

/**
 * The server gates its endpoints on the same `page:database-explorer/access`
 * check, so hiding the navigation entry and refusing a direct API call are one
 * grant rather than two.
 */
export const DATABASE_EXPLORER_ACCESS = {
  resource: 'database-explorer',
  action: 'access',
} as const;

const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'database-explorer',
    path: '/database-explorer',
    access: DATABASE_EXPLORER_ACCESS,
    navigation: { title: 'nav.databaseExplorer', icon: Database },
    componentLoader: () => import('./pages/database-explorer-page.js'),
  },
]);

export default routes;
