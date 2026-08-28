import type { Hono } from 'hono';

import { createAppManagementRoutes } from './app-routes.js';
import {
  createReleaseManagement,
  type ReleaseManagementConfig,
} from './factory.js';
import { createReleaseManagementRoutes } from './routes.js';

export const RELEASE_MANAGEMENT_API_PLUGIN_ID =
  '@nocobase/hub-release-management' as const;

export interface ReleaseManagementApiPlugin {
  readonly id: typeof RELEASE_MANAGEMENT_API_PLUGIN_ID;
  registerApiRoutes(api: Hono): void;
}

/** Creates the complete Hub release capability behind the generic Hub API plugin boundary. */
export function createReleaseManagementApiPlugin(
  config: ReleaseManagementConfig,
): ReleaseManagementApiPlugin {
  const components = createReleaseManagement(config);

  return {
    id: RELEASE_MANAGEMENT_API_PLUGIN_ID,
    registerApiRoutes(api: Hono): void {
      api.route('/apps', createAppManagementRoutes(components));
      api.route(
        '/release-management',
        createReleaseManagementRoutes(components),
      );
    },
  };
}
