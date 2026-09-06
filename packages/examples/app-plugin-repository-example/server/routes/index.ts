import { aggregateRoutes } from './aggregate.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
  type RepositoryApiAction,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';

const actions: readonly RepositoryApiAction[] = [
  'findMany',
  'findOne',
  'count',
  'exists',
  'createOne',
  'updateOne',
  'deleteOne',
];
const names = [
  'repositoryExampleCustomers',
  'repositoryExampleContacts',
  'repositoryExampleProducts',
  'repositoryExampleOrders',
  'repositoryExampleOrderItems',
  'repositoryExampleAtomicCounters',
];
const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: names.map((name) => ({ name, actions, maxLimit: 100 })),
});

// This example uses a shared workspace: every signed-in user can manage its
// sample records. Guard each owned endpoint; unrelated contributions stay untouched.
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    for (const name of names) {
      for (const action of actions)
        router.use(`/${name}:${action}`, authentication.required());
    }
    router.route('/', await repositoryRoutes.createRouter(app));
    router.route('/', await aggregateRoutes.createRouter(app));
    return router;
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
