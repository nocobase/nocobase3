import type { Hono } from 'hono';
import { defineApiRoutes, type AppApiRoutes } from './routes.js';

export interface HealthCheckRoutesApplication {
  readonly appName: string;
  readonly publicBasePath: string;
}

export const healthCheckApiRoutes: AppApiRoutes<HealthCheckRoutesApplication> =
  defineApiRoutes({
    name: '@nocobase/app/health-check',
    register(router: Hono, app: HealthCheckRoutesApplication): void {
      router.get('/healthz', (context) =>
        context.json({
          ok: true,
          app: {
            name: app.appName,
            basePath: app.publicBasePath,
          },
          basePath: app.publicBasePath,
        }),
      );
    },
  });
