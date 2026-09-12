import { Hono } from 'hono';
import { defineApiRoutes, type AppApiRouteContribution } from './routes.js';

export interface HealthCheckRoutesApplication {
  readonly appName: string;
  readonly publicBasePath: string;
}

export const healthCheckApiRoutes: AppApiRouteContribution<HealthCheckRoutesApplication> =
  defineApiRoutes((app: HealthCheckRoutesApplication): Hono => {
    const router = new Hono();

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
    return router;
  });
