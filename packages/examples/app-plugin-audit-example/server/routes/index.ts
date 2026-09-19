import { randomUUID } from 'node:crypto';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Audit } from '@nocobase/audit';
import { customerServiceToken } from '../tokens.js';
import {
  parseCustomerInput,
  parseCustomerUpdate,
  parseCustomerDelete,
} from '../input.js';
import { customerFailure } from '../http-error.js';
import CustomerMaintenanceJob from '../jobs/audit-example.js';

type CustomerEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const appAudit = container.resolve(auditServiceToken);
    const customers = container.resolve(customerServiceToken);
    const router = new Hono();
    const routes = new Hono<CustomerEnv>();
    routes.use('*', authentication.required(), authorization.middleware());
    routes.onError((error, context) => {
      const failure = customerFailure(error);
      return context.json({ code: failure.code }, failure.status);
    });
    const audit = (context: Context<CustomerEnv>): Audit =>
      appAudit.for({
        actor: { type: 'user', id: context.get('authz').identity.principal.id },
        source: { type: 'http', requestId: randomUUID() },
      });
    routes.get('/customers', async (context) =>
      context.json({ data: await customers.list(context.get('authz')) }),
    );
    routes.post('/customers', async (context) =>
      context.json(
        {
          data: await customers.create(
            context.get('authz'),
            parseCustomerInput(await context.req.json()),
            audit(context),
          ),
        },
        201,
      ),
    );
    routes.patch('/customers/:id', async (context) => {
      const body: unknown = await context.req.json();
      const input = parseCustomerUpdate(body);
      if (input.id !== context.req.param('id'))
        return context.json({ code: 'INVALID_CUSTOMER_INPUT' }, 400);
      return context.json({
        data: await customers.update(
          context.get('authz'),
          input,
          audit(context),
        ),
      });
    });
    routes.delete('/customers/:id', async (context) => {
      const input = parseCustomerDelete(await context.req.json());
      if (input.id !== context.req.param('id'))
        return context.json({ code: 'INVALID_CUSTOMER_INPUT' }, 400);
      await customers.remove(context.get('authz'), input, audit(context));
      return context.json({ data: { deleted: true } });
    });
    routes.get('/operations', async (context) =>
      context.json({
        data: await customers.logs(
          context.get('authz'),
          context.req.query('targetId'),
        ),
      }),
    );
    routes.post('/maintenance', async (context) => {
      const input = parseCustomerUpdate(await context.req.json());
      const identity = context.get('authz');
      await identity.require({
        resource: { type: 'audit-example.customer', id: input.id },
        action: 'update',
      });
      const dispatched = await container
        .resolve(queueManagerToken)
        .dispatch(CustomerMaintenanceJob, {
          ownerId: identity.identity.principal.id,
          input,
        });
      return context.json({ data: dispatched }, 202);
    });
    router.route('/audit-example', routes);
    return router;
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
