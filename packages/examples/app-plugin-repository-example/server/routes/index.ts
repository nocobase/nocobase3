import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type RepositoryAuthorizationExposure,
} from '@nocobase/app-plugin-authorization';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
  type RepositoryApiActions,
} from '@nocobase/app-server/router';
import {
  buildRepositoryPolicy,
  type ReadNode,
  type RepositoryPolicy,
} from '@nocobase/db';
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

/**
 * Read whatever the sample data holds, write only the named fields.
 *
 * This is the shape the exposure offers. What a caller actually gets is this
 * narrowed by the grants `authorization.repositories()` resolves for them, so
 * scopes and field lists come from the Permission Set rather than from here.
 */
function fieldsPolicy(
  create: readonly string[],
  update: readonly string[],
  remove: boolean = true,
): RepositoryPolicy {
  return {
    read: true,
    create: { scope: true, fields: create },
    update: { scope: true, fields: update },
    delete: remove ? true : false,
  };
}

/** Readable columns and relations, per Collection. */
const readable: Readonly<
  Record<
    string,
    { fields: readonly string[]; relations: Readonly<Record<string, string>> }
  >
> = {
  repositoryExampleCustomers: {
    fields: ['id', 'name', 'company', 'email', 'status'],
    relations: {
      contacts: 'repositoryExampleContacts',
      orders: 'repositoryExampleOrders',
    },
  },
  repositoryExampleContacts: {
    fields: ['id', 'name', 'email', 'phone', 'customerId'],
    relations: { customer: 'repositoryExampleCustomers' },
  },
  repositoryExampleProducts: {
    fields: ['id', 'name', 'sku', 'unitPriceCents'],
    relations: { items: 'repositoryExampleOrderItems' },
  },
  repositoryExampleOrders: {
    fields: ['id', 'number', 'status', 'version', 'customerId'],
    relations: {
      customer: 'repositoryExampleCustomers',
      items: 'repositoryExampleOrderItems',
    },
  },
  repositoryExampleOrderItems: {
    fields: ['id', 'orderId', 'productId', 'quantity', 'unitPriceCents'],
    relations: {
      order: 'repositoryExampleOrders',
      product: 'repositoryExampleProducts',
    },
  },
  repositoryExampleAtomicCounters: {
    fields: ['id', 'name', 'value'],
    relations: {},
  },
  repositoryExampleRelationUsers: {
    fields: ['id', 'name', 'email'],
    relations: {},
  },
  repositoryExampleRelationProjectProfiles: {
    fields: ['id', 'summary', 'projectId'],
    relations: {},
  },
  repositoryExampleRelationTasks: {
    fields: ['id', 'title', 'status', 'points', 'projectId', 'assigneeId'],
    relations: { assignee: 'repositoryExampleRelationUsers' },
  },
  repositoryExampleRelationTags: { fields: ['id', 'label'], relations: {} },
  repositoryExampleRelationProjectTags: {
    fields: ['projectId', 'tagId', 'role'],
    relations: {},
  },
  repositoryExampleRelationProjects: {
    fields: ['id', 'name', 'status', 'ownerId'],
    relations: {
      owner: 'repositoryExampleRelationUsers',
      profile: 'repositoryExampleRelationProjectProfiles',
      tasks: 'repositoryExampleRelationTasks',
      tags: 'repositoryExampleRelationTags',
    },
  },
  repositoryExampleFindManyRecords: {
    fields: ['id', 'sequence', 'title', 'category', 'description'],
    relations: {},
  },
};

/** Deep enough for customers → orders → items → product; relations cycle. */
const readDepth = 3;

function readNode(name: string, depth: number = readDepth): ReadNode {
  const shape = readable[name];
  if (!shape) throw new Error(`No read shape for ${name}`);
  return {
    scope: true,
    fields: shape.fields,
    relations:
      depth === 0
        ? {}
        : Object.fromEntries(
            Object.entries(shape.relations).map(([relation, target]) => [
              relation,
              readNode(target, depth - 1),
            ]),
          ),
  };
}

const exposures: readonly RepositoryAuthorizationExposure[] = [
  {
    name: 'repositoryExampleCustomers',
    resource: 'repositoryExampleCustomers',
    policy: fieldsPolicy(
      ['id', 'name', 'company', 'email', 'status'],
      ['name', 'company', 'email', 'status'],
    ),
    actions,
  },
  {
    name: 'repositoryExampleContacts',
    resource: 'repositoryExampleContacts',
    policy: buildRepositoryPolicy((policy) =>
      policy
        .read(true)
        .create((create) =>
          create
            .scope(true)
            .fields('id', 'name', 'email', 'phone')
            .relation('customer', (customer) => customer.connect()),
        )
        .update((update) =>
          update
            .scope(true)
            .fields('name', 'email', 'phone')
            .relation('customer', (customer) => customer.connect()),
        )
        .delete(true),
    ),
    actions,
  },
  {
    name: 'repositoryExampleProducts',
    resource: 'repositoryExampleProducts',
    policy: fieldsPolicy(
      ['id', 'name', 'sku', 'unitPriceCents'],
      ['name', 'sku', 'unitPriceCents'],
    ),
    actions,
  },
  {
    name: 'repositoryExampleOrders',
    resource: 'repositoryExampleOrders',
    policy: buildRepositoryPolicy((policy) =>
      policy
        .read(true)
        .create((create) =>
          create
            .scope(true)
            .fields('id', 'number', 'status')
            .relation('customer', (customer) => customer.connect())
            .relation('items', (items) =>
              items.create((item) =>
                item
                  .fields('id', 'quantity', 'unitPriceCents')
                  .relation('product', (product) => product.connect()),
              ),
            ),
        )
        .update((update) =>
          update
            .scope(true)
            .fields('number', 'status')
            .relation('customer', (customer) => customer.connect()),
        )
        .delete(true),
    ),
    actions,
  },
  {
    name: 'repositoryExampleOrderItems',
    resource: 'repositoryExampleOrderItems',
    policy: buildRepositoryPolicy((policy) =>
      policy
        .read(true)
        .create((create) =>
          create
            .scope(true)
            .fields('id', 'quantity', 'unitPriceCents')
            .relation('order', (order) => order.connect())
            .relation('product', (product) => product.connect()),
        )
        .update((update) =>
          update
            .scope(true)
            .fields('quantity', 'unitPriceCents')
            .relation('order', (order) => order.connect())
            .relation('product', (product) => product.connect()),
        )
        .delete(true),
    ),
    actions,
  },
  {
    name: 'repositoryExampleAtomicCounters',
    resource: 'repositoryExampleAtomicCounters',
    policy: fieldsPolicy(['id', 'name', 'value'], ['name', 'value']),
    actions,
  },
  {
    name: 'repositoryExampleRelationUsers',
    resource: 'repositoryExampleRelationUsers',
    policy: fieldsPolicy(['id', 'name', 'email'], ['name', 'email'], false),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleRelationProjectProfiles',
    resource: 'repositoryExampleRelationProjectProfiles',
    policy: fieldsPolicy(['id', 'summary'], ['summary'], false),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleRelationTasks',
    resource: 'repositoryExampleRelationTasks',
    policy: buildRepositoryPolicy((policy) =>
      policy
        .read(true)
        .create((create) =>
          create
            .scope(true)
            .fields('id', 'title', 'status', 'points')
            .relation('assignee', (assignee) => assignee.connect()),
        )
        .update((update) =>
          update.scope(true).fields('title', 'status', 'points'),
        ),
    ),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleRelationTags',
    resource: 'repositoryExampleRelationTags',
    policy: fieldsPolicy(['id', 'label'], ['label'], false),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleRelationProjectTags',
    resource: 'repositoryExampleRelationProjectTags',
    policy: fieldsPolicy(['projectId', 'tagId', 'role'], ['role'], false),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleRelationProjects',
    resource: 'repositoryExampleRelationProjects',
    policy: buildRepositoryPolicy((policy) =>
      policy
        .read(true)
        .create((create) =>
          create
            .scope(true)
            .fields('id', 'name', 'status')
            .relation('owner', (owner) => owner.connect())
            .relation('profile', (profile) =>
              profile.create((values) => values.fields('id', 'summary')),
            )
            .relation('tasks', (tasks) =>
              tasks.create((task) =>
                task
                  .fields('id', 'title', 'status', 'points')
                  .relation('assignee', (assignee) => assignee.connect()),
              ),
            )
            .relation('tags', (tags) =>
              tags.connect((edge) =>
                edge.through((through) => through.fields('role')),
              ),
            ),
        )
        .update((update) =>
          update
            .scope(true)
            .fields('name', 'status')
            .relation('owner', (owner) => owner.connect())
            .relation('profile', (profile) =>
              profile
                .create((values) => values.fields('id', 'summary'))
                .connect()
                .disconnect()
                .update((values) => values.fields('summary'))
                .upsert((branches) =>
                  branches
                    .create((values) => values.fields('id', 'summary'))
                    .update((values) => values.fields('summary')),
                )
                .delete(),
            )
            .relation('tasks', (tasks) =>
              tasks
                .create((task) =>
                  task.fields('id', 'title', 'status', 'points'),
                )
                .connect()
                .disconnect()
                .set()
                .update((task) => task.fields('title', 'status', 'points'))
                .upsert((branches) =>
                  branches
                    .create((task) =>
                      task.fields('id', 'title', 'status', 'points'),
                    )
                    .update((task) => task.fields('title', 'status', 'points')),
                )
                .delete(),
            )
            .relation('tags', (tags) =>
              tags
                .create((tag) =>
                  tag
                    .fields('id', 'label')
                    .through((through) => through.fields('role')),
                )
                .connect((edge) =>
                  edge.through((through) => through.fields('role')),
                )
                .set((edge) =>
                  edge.through((through) => through.fields('role')),
                )
                .disconnect()
                .update((tag) => tag.fields('label'))
                .upsert((branches) =>
                  branches
                    .create((tag) => tag.fields('id', 'label'))
                    .update((tag) => tag.fields('label')),
                )
                .delete(),
            ),
        ),
    ),
    actions: relationActions,
  },
  {
    name: 'repositoryExampleFindManyRecords',
    resource: 'repositoryExampleFindManyRecords',
    policy: { read: true, create: false, update: false, delete: false },
    actions: { findMany: { maxLimit: 100 } },
  },
];
/**
 * A read shape has to name its relations. Authorization narrows this shape
 * with the caller's grant, and a grant carries no relation model — so what the
 * shape leaves out is what a narrowed read cannot reach.
 */
const repositories: readonly RepositoryAuthorizationExposure[] = exposures.map(
  (exposure) => ({
    ...exposure,
    policy: {
      ...(exposure.policy as RepositoryPolicy),
      read: readNode(exposure.name),
    },
  }),
);

// Every owned endpoint is authenticated and then authorized: the middleware
// resolves the caller's grants for the exposure's resource and narrows the
// shape above to what they hold. The seed grants signed-in users this
// example's sample data. Guard each path by name; a wildcard would reach
// contributions mounted alongside this one.
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const authorize = authorization.repositories(repositories);
    for (const { name, actions: enabled } of repositories)
      for (const action of Object.keys(enabled))
        router.use(`/${name}:${action}`, authentication.required(), authorize);
    router.route(
      '/',
      await defineRepositoryApiRoutes({
        principal: authorize.principal,
        repositories: authorize.repositories,
      }).createRouter(app),
    );
    return router;
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
