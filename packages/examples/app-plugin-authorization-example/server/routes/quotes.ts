import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';

import { QUOTES, PROJECTS } from '../sales-authorization.js';
import {
  editableValues,
  writableRepository,
  stateConflict,
} from './mutations.js';

export function createQuoteRoutes(
  database: DatabaseManager,
): Hono<AuthorizationEnv> {
  const router = new Hono<AuthorizationEnv>();

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
      database,
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

    const quote = await writableRepository(database, QUOTES, policy, [
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

  return router;
}
