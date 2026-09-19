import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type {
  DatabaseManager,
  RepositoryRecord,
  UpdateMutationValues,
} from '@nocobase/db';
import { Hono } from 'hono';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';

import { ORDERS } from '../sales-authorization.js';
import {
  editableValues,
  writableRepository,
  stateConflict,
} from './mutations.js';

export function createOrderRoutes(
  database: DatabaseManager,
): Hono<AuthorizationEnv> {
  const router = new Hono<AuthorizationEnv>();

  router.get('/sales/orders/:id/relations', async (c) => {
    const decision = await c.var.authz.authorize({
      resource: { type: 'resource', id: 'example.sales.orders' },
      action: 'view',
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      throw new AuthorizationDeniedError(decision);

    const order = await database
      .repository(ORDERS)
      .withPolicy(decision.conditions.database[ORDERS])
      .findOne({
        filter: { id: c.req.param('id') },
        select: (select) =>
          select
            .fields('id', 'title', 'status')
            .include('deliveryTeam', (team) => team.fields('id', 'title'))
            .include('checks', (checks) => checks.fields('id', 'title', 'done'))
            .include('collaborators', (team) => team.fields('id', 'title')),
      });
    if (!order) return c.json({ code: 'FORBIDDEN' }, 403);

    const manage = await c.var.authz.authorize({
      resource: { type: 'resource', id: 'example.sales.orders' },
      action: 'manageRelations',
    });

    const policy =
      manage.effect !== 'deny'
        ? manage.conditions?.database?.[ORDERS]
        : undefined;
    const editable =
      policy &&
      (await writableRepository(database, ORDERS, policy, [])?.findOne({
        filter: { id: c.req.param('id') },
      }));

    const write =
      editable && order.status === 'ready' ? policy?.update : undefined;
    const relations = write && write !== true ? write.relations : undefined;

    const operations: Record<string, string[]> = {};
    const options: Record<string, RepositoryRecord[]> = {};
    for (const name of ['deliveryTeam', 'checks', 'collaborators']) {
      const node = write === true ? true : relations && relations[name];
      if (node === true) {
        operations[name] = [
          'create',
          'update',
          'upsert',
          'connect',
          'disconnect',
          'set',
          'delete',
        ];
      } else if (node) {
        operations[name] = Object.keys(node).filter((key) => key !== 'scope');
      } else {
        operations[name] = [];
      }

      if (
        name !== 'checks' &&
        node &&
        (node === true || node.connect || node.set)
      ) {
        options[name] = await database
          .repository('authorizationExampleTeams')
          .withPolicy({
            read: {
              scope: node === true ? true : (node.scope ?? true),
              fields: ['id', 'title'],
              relations: false,
            },
            create: false,
            update: false,
            delete: false,
          })
          .findMany({
            select: (select) => select.fields('id', 'title'),
            sort: (sort) => sort.field('title').asc(),
          });
      }
    }

    let access = 'allowed';
    if (!policy) access = 'notGranted';
    else if (!editable) access = 'outsideScope';
    else if (order.status !== 'ready') access = 'notReady';

    return c.json({
      data: {
        ...order,
        operations,
        options,
        access,
      },
    });
  });

  router.post('/sales/orders/:id/relations', async (c) => {
    const decision = await c.var.authz.authorize({
      resource: { type: 'resource', id: 'example.sales.orders' },
      action: 'manageRelations',
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      throw new AuthorizationDeniedError(decision);

    const values: unknown = await c.req.json();
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new TypeError('Expected relation values');

    const policy = decision.conditions.database[ORDERS];

    const order = await writableRepository(
      database,
      ORDERS,
      policy,
      [],
    )?.findOne({
      filter: { id: c.req.param('id') },
    });
    if (!order) return c.json({ code: 'FORBIDDEN' }, 403);
    if (order.status !== 'ready')
      return c.json({ code: 'STATE_CONFLICT' }, 409);

    // Recheck state in the mutation predicate; DB executes nested writes atomically.

    await database
      .repository(ORDERS)
      .withPolicy(decision.conditions.database[ORDERS])
      .updateOne({
        filter: { id: c.req.param('id'), status: 'ready' },
        values: values as UpdateMutationValues<Partial<RepositoryRecord>>,
      });

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

    const order = await writableRepository(database, ORDERS, policy, [
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

  return router;
}
