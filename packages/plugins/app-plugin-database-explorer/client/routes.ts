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
  resource: { type: 'page', id: 'database-explorer' },
  action: 'access',
} as const;

/** The pane a bare page URL opens, and the one the tab strip lists first. */
export const DEFAULT_PANE = 'fields';

/**
 * The two detail panes are child routes rather than component state, so a pane
 * can be linked to, survives a refresh, and is restored by browser Back. The
 * selected connection and collection ride along in the query string, which the
 * parent preserves when it redirects a bare page URL to the default pane.
 */
const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'database-explorer',
    path: '/database-explorer',
    authz: DATABASE_EXPLORER_ACCESS,
    navigation: { title: 'nav.databaseExplorer', icon: Database },
    componentLoader: () => import('./pages/database-explorer-page.js'),
    children: [
      // Each pane repeats the grant. A Settings child Route that declares no
      // access is reachable without one, so the page's own check would not
      // cover the URLs the panes actually live at.
      {
        name: 'database-explorer.fields',
        path: 'fields',
        authz: DATABASE_EXPLORER_ACCESS,
        componentLoader: () => import('./pages/collection-fields.js'),
      },
      {
        name: 'database-explorer.columns',
        path: 'columns',
        authz: DATABASE_EXPLORER_ACCESS,
        componentLoader: () => import('./pages/collection-columns.js'),
      },
    ],
  },
]);

export default routes;
