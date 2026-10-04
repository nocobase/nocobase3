import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { ApiError, parseApiInput } from '@nocobase/app-server/router';
import type { DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';

import { QUOTES, PROJECTS } from '../sales-authorization.js';
import {
  AUTHORIZATION_EXAMPLE_DOMAIN,
  forbidden,
  stateConflict,
  stateConflictError,
  writableRepository,
} from './mutations.js';
import { QuoteParams, UpdateQuoteInput } from './schemas.js';

export function createQuoteRoutes(
  database: DatabaseManager,
): Hono<AuthorizationEnv> {
  const router = new Hono<AuthorizationEnv>();

  router.patch(
    '/sales/quotes/:quoteId',
    validator('param', (value) => parseApiInput(QuoteParams, value)),
    validator('json', (value) => parseApiInput(UpdateQuoteInput, value)),
    async (c) => {
      const { quoteId } = c.req.valid('param');
      const values = c.req.valid('json');
      const decision = await c.var.authz.authorize({
        resource: { type: 'composite', id: 'example.sales.quotes' },
        action: 'edit',
      });
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);

      const policy = decision.conditions.database[QUOTES];
      const editable = await writableRepository(
        database,
        QUOTES,
        policy,
        Object.keys(values),
      )?.findOne({ filter: { id: quoteId } });
      if (!editable) throw forbidden();
      if (editable.status !== 'draft')
        throw stateConflictError('Only a draft quote can be edited.');

      const { record } = await database
        .repository(QUOTES)
        .withPolicy(policy)
        .updateOne({
          filter: { id: quoteId, status: 'draft' },
          values: values as Record<string, string | number>,
        })
        .catch(stateConflict);

      return c.json({ data: record });
    },
  );

  router.post(
    '/sales/quotes/:quoteId/submit',
    validator('param', (value) => parseApiInput(QuoteParams, value)),
    async (c) => {
      const { quoteId } = c.req.valid('param');
      const decision = await c.var.authz.authorize({
        resource: { type: 'composite', id: 'example.sales.quotes' },
        action: 'submit',
      });
      if (decision.effect === 'deny' || !decision.conditions?.database)
        throw new AuthorizationDeniedError(decision);

      const policy = decision.conditions.database[QUOTES];

      const quote = await writableRepository(database, QUOTES, policy, [
        'status',
      ])?.findOne({ filter: { id: quoteId } });
      if (!quote || typeof quote.projectId !== 'string') throw forbidden();

      const projectPolicy = decision.conditions.database[PROJECTS];
      const project = await database
        .repository(PROJECTS)
        .withPolicy(projectPolicy)
        .findOne({ filter: { id: quote.projectId } });
      if (!project) throw forbidden();
      if (quote.status !== 'draft')
        throw stateConflictError('Only a draft quote can be submitted.');

      if (typeof quote.amount !== 'number' || quote.amount <= 0)
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'INVALID_INPUT',
          domain: AUTHORIZATION_EXAMPLE_DOMAIN,
          message: 'A quote needs a positive amount before it is submitted.',
          fieldViolations: [
            { field: 'amount', description: 'Must be greater than 0.' },
          ],
        });

      const { record } = await database
        .repository(QUOTES)
        .withPolicy(policy)
        .updateOne({
          filter: (filter) =>
            filter.and([
              filter.string('id').eq(quoteId),
              filter.string('status').eq('draft'),
              filter.number('amount').gt(0),
            ]),
          values: { status: 'submitted' },
        })
        .catch(stateConflict);

      return c.json({ data: record });
    },
  );

  return router;
}
