import { Hono } from 'hono';

import type { AppSettingsRepository } from '../../repositories/app-settings.js';

export interface AppSettingsRoutesOptions {
  appSettings: AppSettingsRepository;
}

export function createAppSettingsRoutes(
  options: AppSettingsRoutesOptions,
): Hono {
  const routes = new Hono();

  routes.get('/', async (c) => {
    return c.json({
      settings: await options.appSettings.all(),
    });
  });

  return routes;
}
