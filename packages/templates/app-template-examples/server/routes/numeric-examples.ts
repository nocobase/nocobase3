import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { NumericExamplesService } from '../providers/numeric-examples-service.js';

// Shared read-only learning data is available to every signed-in user.
// No generic query input or write endpoint is exposed.
export const numericExamplesRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    if (!app.container.has(databaseManagerToken)) {
      router.get('/numeric-examples', (c) =>
        c.json({ code: 'DATABASE_UNAVAILABLE' }, 503),
      );
      return router;
    }
    const auth = app.container.resolve(authenticationToken);
    const service = new NumericExamplesService(
      app.container.resolve(databaseManagerToken),
    );
    router.use('/numeric-examples', auth.required());
    router.get('/numeric-examples', async (c) => {
      const source = c.req.query('source') ?? 'query';
      const sample = c.req.query('sample') ?? 'all';
      const sortField = c.req.query('sortField') ?? 'id';
      const sortDirection = c.req.query('sortDirection') ?? 'asc';
      if (
        (source !== 'query' && source !== 'repository') ||
        (sample !== 'all' && sample !== 'null' && sample !== 'empty')
      ) {
        return c.json({ code: 'INVALID_NUMERIC_EXAMPLE_OPTIONS' }, 400);
      }
      return c.json({
        data: await service.read(
          source,
          sample,
          sortField as never,
          sortDirection as never,
        ),
      });
    });
    return router;
  });
