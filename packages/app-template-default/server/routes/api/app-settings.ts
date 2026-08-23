import { Hono } from 'hono';

import type { AppSettings } from '../../services/index.js';

export interface AppSettingsRoutesOptions {
  appSettingsStore: AppSettings;
}

export function createAppSettingsRoutes(
  options: AppSettingsRoutesOptions,
): Hono {
  const routes = new Hono();

  routes.get('/', async (c) => {
    return c.json({
      settings: await options.appSettingsStore.all(),
    });
  });

  return routes;
}
