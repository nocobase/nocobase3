import { Hono } from 'hono';

import type { AppServices } from '../services/index.js';

export interface ApiRouteOptions {
  appName: string;
  publicBasePath: string;
  services: AppServices;
}

export function createApiRoutes(options: ApiRouteOptions): Hono {
  const api = new Hono();

  api.get('/healthz', (c) => {
    return c.json({
      ok: true,
      app: {
        name: options.appName,
        basePath: options.publicBasePath,
      },
      basePath: options.publicBasePath,
    });
  });

  api.get('/apps', (c) => {
    return c.json({
      apps: [],
    });
  });

  api.get('/app-settings', async (c) => {
    const appSettings = options.services.appSettings;

    if (!appSettings) {
      return c.json(
        {
          error: 'Database is not configured.',
        },
        503,
      );
    }

    return c.json({
      settings: await appSettings.all(),
    });
  });

  return api;
}
