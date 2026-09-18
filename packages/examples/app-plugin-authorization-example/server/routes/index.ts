import { salesRecords } from '../sales-records.js';
import type { RepositoryPolicy } from '@nocobase/db';
import { PROJECTS, QUOTES, ORDERS } from '../sales-authorization.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes<AppPluginApplication>((app) => {
    const router = new Hono<AuthorizationEnv>();
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    router.use(
      '*',
      app.container.resolve(authenticationToken).required(),
      authz.middleware(),
      bodyLimit({ maxSize: 4096 }),
    );
    router.get('/context', async (c) => {
      const identity = c.var.authz.identity;
      const sets = await authz.permissionSets.getEffective(identity);
      const assignments = await authz.permissionSets.listAssignments();
      const subjects = [identity.principal, ...(identity.subjects ?? [])];
      return c.json({
        data: {
          canReset: (await c.var.authz.permissions()).unrestricted,
          roles: sets.map((set) => ({
            key: set.key,
            title: set.title,
            sources: assignments
              .filter(
                (assignment) =>
                  assignment.permissionSet === set.key &&
                  subjects.some(
                    (subject) =>
                      subject.type === assignment.subject.type &&
                      subject.id === assignment.subject.id,
                  ),
              )
              .map((assignment) => assignment.subject),
          })),
        },
      });
    });
    router.post('/reset', async (c) => {
      if (!(await c.var.authz.permissions()).unrestricted)
        return c.json({ code: 'FORBIDDEN' }, 403);
      await database.transaction(async (connection) => {
        const users: Record<string, string> = {};
        for (const key of ['assistant', 'engineer', 'manager']) {
          const user = await connection.query
            .selectFrom('user')
            .select('id')
            .where('username', '=', `sales_${key}`)
            .executeTakeFirst();
          if (!user || typeof user.id !== 'string')
            throw new Error(
              'Example accounts are missing; run application seeds first',
            );
          users[key] = user.id;
        }
        const records = salesRecords(users);
        for (const [collection, rows] of [
          [PROJECTS, records.projects],
          [QUOTES, records.quotes],
          [ORDERS, records.orders],
        ] as const) {
          for (const row of rows) {
            const existing = await connection.query
              .selectFrom(collection)
              .select('id')
              .where('id', '=', row.id)
              .executeTakeFirst();
            if (existing)
              await connection.query
                .updateTable(collection)
                .set(row)
                .where('id', '=', row.id)
                .execute();
            else
              await connection.query
                .insertInto(collection)
                .values(row)
                .execute();
          }
        }
      });
      return c.json({ data: { saved: true } });
    });
    function writableRepository(
      collection: string,
      policy: RepositoryPolicy,
      fields: string[],
    ) {
      const write = policy.update;
      if (
        !policy.read ||
        !write ||
        (write !== true &&
          write.fields !== undefined &&
          (write.fields === false ||
            !fields.every(
              (field) =>
                write.fields !== false && write.fields?.includes(field),
            )))
      )
        return undefined;
      return database
        .repository(collection)
        .withPolicy(policy)
        .narrow({ read: write === true ? true : { scope: write.scope } });
    }
    async function operation(
      scope: AuthorizationScope,
      path: string,
      collection: string,
      action: string,
      fields: string[],
    ) {
      const decision = await scope.authorize({
        resource: { type: 'resource', id: `example.sales.${path}` },
        action,
      });
      const policies =
        decision.effect !== 'deny' ? decision.conditions?.database : undefined;
      const repository =
        policies?.[collection] &&
        writableRepository(collection, policies[collection], fields);
      return {
        policies,
        ids: new Set(
          ((await repository?.findMany()) ?? []).map((row) => row.id),
        ),
      };
    }
    async function projectSummaries(
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
    for (const [path, collection] of [
      ['projects', PROJECTS],
      ['quotes', QUOTES],
      ['orders', ORDERS],
    ] as const) {
      router.get(`/sales/${path}`, async (c) => {
        const scope = c.var.authz;
        const decision = await scope.authorize({
          resource: { type: 'resource', id: `example.sales.${path}` },
          action: 'view',
        });
        if (decision.effect === 'deny' || !decision.conditions?.database)
          throw new AuthorizationDeniedError(decision);
        const policy = decision.conditions.database[collection];
        const items = !policy.read
          ? []
          : await database
              .repository(collection)
              .withPolicy(policy)
              .findMany({ sort: (sort) => sort.field('id').asc() });
        const projects =
          path === 'projects' ? {} : await projectSummaries(scope);
        const action = path === 'orders' ? 'deliver' : 'edit';
        const edit = await operation(
          scope,
          path,
          collection,
          action,
          path === 'orders'
            ? ['status', 'deliveryReference']
            : path === 'quotes'
              ? ['amount', 'notes']
              : ['notes'],
        );
        const submit =
          path === 'quotes'
            ? await operation(scope, path, collection, 'submit', ['status'])
            : undefined;
        const projectPolicy = submit?.policies?.[PROJECTS];
        const projectIds = new Set(
          (projectPolicy?.read
            ? await database
                .repository(PROJECTS)
                .withPolicy(projectPolicy)
                .findMany()
            : []
          ).map((row) => row.id),
        );
        const navigation: Record<string, boolean> = {};
        for (const page of ['projects', 'quotes', 'orders'])
          navigation[page] = await scope.can({
            resource: { type: 'page', id: `example.sales.${page}` },
            action: 'access',
          });
        return c.json({
          data: {
            navigation,
            items: items.map((row) => ({
              ...row,
              project:
                typeof row.projectId === 'string'
                  ? projects[row.projectId]
                  : undefined,
              operations: {
                [action]: !edit.policies
                  ? 'notGranted'
                  : !edit.ids.has(row.id)
                    ? 'outsideScope'
                    : path === 'quotes' && row.status !== 'draft'
                      ? 'notDraft'
                      : path === 'orders' && row.status !== 'ready'
                        ? 'notReady'
                        : 'allowed',
                ...(submit
                  ? {
                      submit: !submit.policies
                        ? 'notGranted'
                        : !submit.ids.has(row.id)
                          ? 'quoteScope'
                          : !projectIds.has(row.projectId)
                            ? 'projectScope'
                            : row.status !== 'draft'
                              ? 'notDraft'
                              : typeof row.amount !== 'number' ||
                                  row.amount <= 0
                                ? 'invalidAmount'
                                : 'allowed',
                    }
                  : {}),
              },
            })),
          },
        });
      });
    }
    router.post('/sales/projects/:id', async (c) => {
      const decision = await c.var.authz.authorize({
        resource: { type: 'resource', id: 'example.sales.projects' },
        action: 'edit',
      });
      const values = editableValues(await c.req.json(), ['title', 'notes']);
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);
      const policy = decision.conditions.database[PROJECTS];
      await database
        .repository(PROJECTS)
        .withPolicy(policy)
        .updateOne({ filter: { id: c.req.param('id') }, values });
      return c.json({ data: { saved: true } });
    });
    router.post('/sales/quotes/:id', async (c) => {
      const decision = await c.var.authz.authorize({
        resource: { type: 'resource', id: 'example.sales.quotes' },
        action: 'edit',
      });
      const values = editableValues(await c.req.json(), ['amount', 'notes']);
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);
      const policy = decision.conditions.database[QUOTES];
      const editable = await writableRepository(
        QUOTES,
        policy,
        Object.keys(values),
      )?.findOne({ filter: { id: c.req.param('id') } });
      if (!editable) return c.json({ code: 'FORBIDDEN' }, 403);
      if (editable.status !== 'draft')
        return c.json({ code: 'STATE_CONFLICT' }, 409);
      await database
        .repository(QUOTES)
        .withPolicy(policy)
        .updateOne({
          filter: { id: c.req.param('id'), status: 'draft' },
          values,
        })
        .catch(stateConflict);
      return c.json({ data: { saved: true } });
    });
    router.post('/sales/quotes/:id/submit', async (c) => {
      const decision = await c.var.authz.authorize({
        resource: { type: 'resource', id: 'example.sales.quotes' },
        action: 'submit',
      });
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);
      const policy = decision.conditions.database[QUOTES];
      const quote = await writableRepository(QUOTES, policy, [
        'status',
      ])?.findOne({ filter: { id: c.req.param('id') } });
      if (!quote || typeof quote.projectId !== 'string')
        return c.json({ code: 'FORBIDDEN' }, 403);
      const projectPolicy = decision.conditions.database[PROJECTS];
      const project = await database
        .repository(PROJECTS)
        .withPolicy(projectPolicy)
        .findOne({ filter: { id: quote.projectId } });
      if (!project) return c.json({ code: 'FORBIDDEN' }, 403);
      if (quote.status !== 'draft')
        return c.json({ code: 'STATE_CONFLICT' }, 409);
      if (typeof quote.amount !== 'number' || quote.amount <= 0)
        return c.json({ code: 'INVALID_INPUT' }, 400);
      await database
        .repository(QUOTES)
        .withPolicy(policy)
        .updateOne({
          filter: (filter) =>
            filter.and([
              filter.string('id').eq(c.req.param('id')),
              filter.string('status').eq('draft'),
              filter.number('amount').gt(0),
            ]),
          values: { status: 'submitted' },
        })
        .catch(stateConflict);
      return c.json({ data: { saved: true } });
    });
    router.post('/sales/orders/:id/deliver', async (c) => {
      const decision = await c.var.authz.authorize({
        resource: { type: 'resource', id: 'example.sales.orders' },
        action: 'deliver',
      });
      const values = editableValues(await c.req.json(), ['deliveryReference']);
      if (
        typeof values.deliveryReference !== 'string' ||
        !values.deliveryReference.trim()
      )
        return c.json({ code: 'DELIVERY_REFERENCE_REQUIRED' }, 400);
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);
      const policy = decision.conditions.database[ORDERS];
      const order = await writableRepository(ORDERS, policy, [
        'status',
        'deliveryReference',
      ])?.findOne({ filter: { id: c.req.param('id') } });
      if (!order) return c.json({ code: 'FORBIDDEN' }, 403);
      if (order.status !== 'ready')
        return c.json({ code: 'STATE_CONFLICT' }, 409);
      await database
        .repository(ORDERS)
        .withPolicy(policy)
        .updateOne({
          filter: { id: c.req.param('id'), status: 'ready' },
          values: { ...values, status: 'delivered' },
        })
        .catch(stateConflict);
      return c.json({ data: { saved: true } });
    });
    router.onError((error, c) => {
      if (error instanceof StateConflictError)
        return c.json({ code: 'STATE_CONFLICT' }, 409);
      if (error instanceof TypeError)
        return c.json({ code: 'INVALID_INPUT' }, 400);
      if (
        error instanceof AuthorizationDeniedError ||
        (error instanceof RepositoryError &&
          [
            'READ_FORBIDDEN',
            'WRITE_FORBIDDEN',
            'FIELD_WRITE_FORBIDDEN',
            'RELATION_WRITE_FORBIDDEN',
            'RECORD_NOT_FOUND',
            'RELATION_TARGET_NOT_FOUND',
            'RECORD_OUTSIDE_SCOPE',
            'SCOPE_VIOLATION',
          ].includes(error.code))
      )
        return c.json({ code: 'FORBIDDEN' }, 403);
      throw error;
    });
    return new Hono().route('/authorization-example', router);
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;

function editableValues(
  body: unknown,
  fields: readonly string[],
): Record<string, string | number> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.keys(body).length
  )
    throw new TypeError('Expected fields');
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!fields.includes(key)) throw new TypeError('Unexpected field');
    if (key === 'amount') {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
      )
        throw new TypeError('Invalid amount');
    } else if (typeof value !== 'string' || value.length > 500)
      throw new TypeError('Invalid text');
    values[key] = value;
  }
  return values;
}

class StateConflictError extends Error {}

function stateConflict(error: unknown): never {
  if (error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND')
    throw new StateConflictError('Record changed during the operation');
  throw error;
}
