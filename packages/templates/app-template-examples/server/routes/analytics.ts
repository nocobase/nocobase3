import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
  type RepositoryApiActions,
  type RepositoryApiExposure,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { databaseManagerToken } from '@nocobase/db';

const actions: RepositoryApiActions = {
  findMany: { maxLimit: 100 },
  findOne: {},
  count: {},
  exists: {},
  aggregate: {},
  groupBy: {},
  deleteOne: {},
};
const repositories: readonly RepositoryApiExposure[] = [
  {
    name: 'analyticsChannels',
    collection: 'channels',
    connection: 'analytics',
    actions: {
      ...actions,
      createOne: { writePolicy: (w) => w.fields('id', 'name', 'code') },
      updateOne: { writePolicy: (w) => w.fields('name', 'code') },
    },
  },
  {
    name: 'analyticsCampaigns',
    collection: 'campaigns',
    connection: 'analytics',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'name', 'status', 'budgetCents')
            .relation('channel', (r) => r.connect()),
      },
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('name', 'status', 'budgetCents')
            .relation('channel', (r) => r.connect()),
      },
    },
  },
  {
    name: 'analyticsDailyMetrics',
    collection: 'dailyMetrics',
    connection: 'analytics',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields(
              'id',
              'date',
              'impressions',
              'clicks',
              'conversions',
              'spendCents',
              'revenueCents',
            )
            .relation('campaign', (r) => r.connect()),
      },
      updateOne: {
        writePolicy: (w) =>
          w
            .fields(
              'date',
              'impressions',
              'clicks',
              'conversions',
              'spendCents',
              'revenueCents',
            )
            .relation('campaign', (r) => r.connect()),
      },
    },
  },
];
const repositoryRoutes = defineRepositoryApiRoutes({ repositories });

// Like the Repository example plugin, this is a shared demonstration workspace:
// every signed-in user may manage sample records. Policies restrict writable
// fields and relation operations; middleware guards only these owned endpoints.
export const analyticsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    // Match the application's database-disabled mode without requiring plugin
    // services or exposing any data, and keep unrelated routes operational.
    if (!app.container.has(databaseManagerToken)) {
      for (const { name, actions: enabledActions } of repositories) {
        for (const action of Object.keys(enabledActions)) {
          router.post(`/${name}:${action}`, (c) =>
            c.json({ code: 'DATABASE_UNAVAILABLE' }, 503),
          );
        }
      }
      return router;
    }
    const authentication = app.container.resolve(authenticationToken);
    for (const { name, actions: enabledActions } of repositories) {
      for (const action of Object.keys(enabledActions)) {
        router.use(`/${name}:${action}`, authentication.required());
      }
    }
    router.route('/', await repositoryRoutes.createRouter(app));
    return router;
  });
