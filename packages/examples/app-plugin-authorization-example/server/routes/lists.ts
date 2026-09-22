import type {
  AuthorizationEnv,
  AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';

import { PROJECTS, QUOTES, ORDERS } from '../sales-authorization.js';
import { writableRepository } from './mutations.js';

export function createSalesListRoutes(
  database: DatabaseManager,
): Hono<AuthorizationEnv> {
  const router = new Hono<AuthorizationEnv>();

  router.get('/sales/projects', async (c) => {
    const scope = c.var.authz;
    const items = await viewRecords(
      database,
      scope,
      'example.sales.projects',
      PROJECTS,
    );
    const edit = await operationAccess(
      database,
      scope,
      'example.sales.projects',
      PROJECTS,
      'edit',
      ['notes'],
    );
    const navigation = await pageNavigation(scope);

    return c.json({
      data: {
        navigation,
        items: items.map((row) => {
          let editAccess = 'allowed';
          if (!edit.policies) editAccess = 'notGranted';
          else if (!edit.ids.has(row.id)) editAccess = 'outsideScope';

          return { ...row, operations: { edit: editAccess } };
        }),
      },
    });
  });

  router.get('/sales/quotes', async (c) => {
    const scope = c.var.authz;
    const items = await viewRecords(
      database,
      scope,
      'example.sales.quotes',
      QUOTES,
    );
    const projects = await projectSummaries(database, scope);
    const edit = await operationAccess(
      database,
      scope,
      'example.sales.quotes',
      QUOTES,
      'edit',
      ['amount', 'notes'],
    );
    const submit = await operationAccess(
      database,
      scope,
      'example.sales.quotes',
      QUOTES,
      'submit',
      ['status'],
    );

    const projectPolicy = submit.policies?.[PROJECTS];
    const submittableProjects = projectPolicy?.read
      ? await database.repository(PROJECTS).withPolicy(projectPolicy).findMany()
      : [];
    const projectIds = new Set(submittableProjects.map((row) => row.id));
    const navigation = await pageNavigation(scope);

    return c.json({
      data: {
        navigation,
        items: items.map((row) => {
          let editAccess = 'allowed';
          if (!edit.policies) editAccess = 'notGranted';
          else if (!edit.ids.has(row.id)) editAccess = 'outsideScope';
          else if (row.status !== 'draft') editAccess = 'notDraft';

          let submitAccess = 'allowed';
          if (!submit.policies) submitAccess = 'notGranted';
          else if (!submit.ids.has(row.id)) submitAccess = 'quoteScope';
          else if (!projectIds.has(row.projectId))
            submitAccess = 'projectScope';
          else if (row.status !== 'draft') submitAccess = 'notDraft';
          else if (typeof row.amount !== 'number' || row.amount <= 0)
            submitAccess = 'invalidAmount';

          return {
            ...row,
            project:
              typeof row.projectId === 'string'
                ? projects[row.projectId]
                : undefined,
            operations: { edit: editAccess, submit: submitAccess },
          };
        }),
      },
    });
  });

  router.get('/sales/orders', async (c) => {
    const scope = c.var.authz;
    const items = await viewRecords(
      database,
      scope,
      'example.sales.orders',
      ORDERS,
    );
    const projects = await projectSummaries(database, scope);
    const deliver = await operationAccess(
      database,
      scope,
      'example.sales.orders',
      ORDERS,
      'deliver',
      ['status', 'deliveryReference'],
    );
    const navigation = await pageNavigation(scope);

    return c.json({
      data: {
        navigation,
        items: items.map((row) => {
          let deliverAccess = 'allowed';
          if (!deliver.policies) deliverAccess = 'notGranted';
          else if (!deliver.ids.has(row.id)) deliverAccess = 'outsideScope';
          else if (row.status !== 'ready') deliverAccess = 'notReady';

          return {
            ...row,
            project:
              typeof row.projectId === 'string'
                ? projects[row.projectId]
                : undefined,
            operations: { deliver: deliverAccess },
          };
        }),
      },
    });
  });

  return router;
}

async function viewRecords(
  database: DatabaseManager,
  scope: AuthorizationScope,
  resource: string,
  collection: string,
) {
  const decision = await scope.authorize({
    resource: { type: 'resource', id: resource },
    action: 'view',
  });
  if (decision.effect === 'deny' || !decision.conditions?.database)
    throw new AuthorizationDeniedError(decision);

  const policy = decision.conditions.database[collection];
  if (!policy.read) return [];

  return database
    .repository(collection)
    .withPolicy(policy)
    .findMany({ sort: (sort) => sort.field('id').asc() });
}

async function pageNavigation(
  scope: AuthorizationScope,
): Promise<Record<string, boolean>> {
  return {
    projects: await scope.can({
      resource: { type: 'page', id: 'example.sales.projects' },
      action: 'access',
    }),
    quotes: await scope.can({
      resource: { type: 'page', id: 'example.sales.quotes' },
      action: 'access',
    }),
    orders: await scope.can({
      resource: { type: 'page', id: 'example.sales.orders' },
      action: 'access',
    }),
  };
}

async function operationAccess(
  database: DatabaseManager,
  scope: AuthorizationScope,
  resource: string,
  collection: string,
  action: string,
  fields: string[],
) {
  const decision = await scope.authorize({
    resource: { type: 'resource', id: resource },
    action,
  });

  const policies =
    decision.effect !== 'deny' ? decision.conditions?.database : undefined;
  const repository =
    policies?.[collection] &&
    writableRepository(database, collection, policies[collection], fields);

  return {
    policies,
    ids: new Set(((await repository?.findMany()) ?? []).map((row) => row.id)),
  };
}

async function projectSummaries(
  database: DatabaseManager,
  scope: AuthorizationScope,
): Promise<Record<string, { title: string; region: string }>> {
  const decision = await scope.authorize({
    resource: { type: 'resource', id: 'example.sales.projects' },
    action: 'view',
  });
  const policy =
    decision.effect !== 'deny'
      ? decision.conditions?.database?.[PROJECTS]
      : undefined;
  if (!policy?.read) return {};

  const rows = await database
    .repository<{ id: string; title: string; region: string }>(PROJECTS)
    .withPolicy(policy)
    .findMany();

  const summaries: Record<string, { title: string; region: string }> = {};
  for (const row of rows) {
    if (
      typeof row.id === 'string' &&
      typeof row.title === 'string' &&
      typeof row.region === 'string'
    )
      summaries[row.id] = { title: row.title, region: row.region };
  }

  return summaries;
}
