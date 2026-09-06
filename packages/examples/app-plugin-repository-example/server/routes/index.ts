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
  'aggregate',
  'groupBy',
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
] as const;
const relationActions: readonly RepositoryApiAction[] = [
  'findMany',
  'findOne',
  'createOne',
  'updateOne',
];
const relationNames = [
  'repositoryExampleRelationUsers',
  'repositoryExampleRelationProjectProfiles',
  'repositoryExampleRelationTasks',
  'repositoryExampleRelationTags',
  'repositoryExampleRelationProjectTags',
  'repositoryExampleRelationProjects',
] as const;
const findManyRepositoryName = 'repositoryExampleFindManyRecords';
const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    ...names.map((name) => ({ name, actions, maxLimit: 100 })),
    ...relationNames.map((name) => ({
      name,
      actions: relationActions,
      maxLimit: 100,
    })),
    {
      name: findManyRepositoryName,
      actions: ['findMany'],
      maxLimit: 100,
    },
  ],
});

// This example uses a shared workspace: every signed-in user can manage its
// sample records. Guard each owned endpoint; unrelated contributions stay untouched.
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    for (const name of names)
      for (const action of actions)
        router.use(`/${name}:${action}`, authentication.required());
    for (const name of relationNames)
      for (const action of relationActions)
        router.use(`/${name}:${action}`, authentication.required());
    router.use(
      `/${findManyRepositoryName}:findMany`,
      authentication.required(),
    );
    router.route('/', await repositoryRoutes.createRouter(app));
    return router;
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
