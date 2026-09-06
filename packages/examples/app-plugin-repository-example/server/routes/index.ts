import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
  type RepositoryApiActions,
  type RepositoryApiExposure,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';

const actions: RepositoryApiActions = {
  findMany: { maxLimit: 100 },
  findOne: {},
  count: {},
  aggregate: {},
  groupBy: {},
  exists: {},
  createOne: {},
  updateOne: {},
  deleteOne: {},
};
const relationActions: RepositoryApiActions = {
  findMany: { maxLimit: 100 },
  findOne: {},
  createOne: {},
  updateOne: {},
};
const repositories: readonly RepositoryApiExposure[] = [
  {
    name: 'repositoryExampleCustomers',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w.fields('id', 'name', 'company', 'email', 'status'),
      },
      updateOne: {
        writePolicy: (w) => w.fields('name', 'company', 'email', 'status'),
      },
    },
  },
  {
    name: 'repositoryExampleContacts',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'name', 'email', 'phone')
            .relation('customer', (r) => r.connect()),
      },
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('name', 'email', 'phone')
            .relation('customer', (r) => r.connect()),
      },
    },
  },
  {
    name: 'repositoryExampleProducts',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) => w.fields('id', 'name', 'sku', 'unitPriceCents'),
      },
      updateOne: {
        writePolicy: (w) => w.fields('name', 'sku', 'unitPriceCents'),
      },
    },
  },
  {
    name: 'repositoryExampleOrders',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'number', 'status')
            .relation('customer', (r) => r.connect())
            .relation('items', (r) =>
              r.create((item) =>
                item
                  .fields('id', 'quantity', 'unitPriceCents')
                  .relation('product', (p) => p.connect()),
              ),
            ),
      },
      updateOne: {
        writePolicy: (w) =>
          w.fields('number', 'status').relation('customer', (r) => r.connect()),
      },
    },
  },
  {
    name: 'repositoryExampleOrderItems',
    actions: {
      ...actions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'quantity', 'unitPriceCents')
            .relation('order', (r) => r.connect())
            .relation('product', (r) => r.connect()),
      },
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('quantity', 'unitPriceCents')
            .relation('order', (r) => r.connect())
            .relation('product', (r) => r.connect()),
      },
    },
  },
  {
    name: 'repositoryExampleAtomicCounters',
    actions: {
      ...actions,
      createOne: { writePolicy: { fields: ['id', 'name', 'value'] } },
      updateOne: { writePolicy: { fields: ['name', 'value'] } },
    },
  },
  {
    name: 'repositoryExampleRelationUsers',
    actions: {
      ...relationActions,
      createOne: { writePolicy: { fields: ['id', 'name', 'email'] } },
      updateOne: { writePolicy: { fields: ['name', 'email'] } },
    },
  },
  {
    name: 'repositoryExampleRelationProjectProfiles',
    actions: {
      ...relationActions,
      createOne: { writePolicy: { fields: ['id', 'summary'] } },
      updateOne: { writePolicy: { fields: ['summary'] } },
    },
  },
  {
    name: 'repositoryExampleRelationTasks',
    actions: {
      ...relationActions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'title', 'status', 'points')
            .relation('assignee', (r) => r.connect()),
      },
      updateOne: { writePolicy: { fields: ['title', 'status', 'points'] } },
    },
  },
  {
    name: 'repositoryExampleRelationTags',
    actions: {
      ...relationActions,
      createOne: { writePolicy: { fields: ['id', 'label'] } },
      updateOne: { writePolicy: { fields: ['label'] } },
    },
  },
  {
    name: 'repositoryExampleRelationProjectTags',
    actions: {
      ...relationActions,
      createOne: { writePolicy: { fields: ['projectId', 'tagId', 'role'] } },
      updateOne: { writePolicy: { fields: ['role'] } },
    },
  },
  {
    name: 'repositoryExampleRelationProjects',
    actions: {
      ...relationActions,
      createOne: {
        writePolicy: (w) =>
          w
            .fields('id', 'name', 'status')
            .relation('owner', (r) => r.connect())
            .relation('profile', (r) =>
              r.create((profile) => profile.fields('id', 'summary')),
            )
            .relation('tasks', (r) =>
              r.create((task) =>
                task
                  .fields('id', 'title', 'status', 'points')
                  .relation('assignee', (a) => a.connect()),
              ),
            )
            .relation('tags', (r) =>
              r.connect((edge) => edge.through((t) => t.fields('role'))),
            ),
      },
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('name', 'status')
            .relation('owner', (r) => r.connect())
            .relation('profile', (r) =>
              r.update((profile) => profile.fields('summary')),
            )
            .relation('tasks', (r) =>
              r
                .create((task) =>
                  task.fields('id', 'title', 'status', 'points'),
                )
                .connect()
                .disconnect()
                .update((task) => task.fields('title', 'status', 'points'))
                .upsert((u) =>
                  u
                    .create((task) =>
                      task.fields('id', 'title', 'status', 'points'),
                    )
                    .update((task) => task.fields('title', 'status', 'points')),
                )
                .delete(),
            )
            .relation('tags', (r) =>
              r
                .create((tag) =>
                  tag.fields('id', 'label').through((t) => t.fields('role')),
                )
                .connect((edge) => edge.through((t) => t.fields('role')))
                .set((edge) => edge.through((t) => t.fields('role'))),
            ),
      },
    },
  },
  {
    name: 'repositoryExampleFindManyRecords',
    actions: { findMany: { maxLimit: 100 } },
  },
];
const repositoryRoutes = defineRepositoryApiRoutes({ repositories });

// This example uses a shared workspace: every signed-in user can manage its
// sample records. Guard each owned endpoint; unrelated contributions stay untouched.
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    for (const { name, actions: enabledActions } of repositories)
      for (const action of Object.keys(enabledActions))
        router.use(`/${name}:${action}`, authentication.required());
    router.route('/', await repositoryRoutes.createRouter(app));
    return router;
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
