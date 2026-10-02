import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  LifecycleError,
  type JsonObject,
  type LifecycleErrorCode,
} from '@nocobase/lifecycle';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { parseItems } from '../../shared/expense.js';
import { person } from '../../shared/people.js';
import { text } from '../../shared/text.js';
import {
  ExampleError,
  type ExpenseDraft,
} from '../services/lifecycle-example.js';
import {
  lifecycleExampleServiceToken,
  type ExampleLifecycleName,
} from '../tokens.js';

const LIFECYCLE_STATUS: Record<LifecycleErrorCode, ContentfulStatusCode> = {
  INVALID_DEFINITION: 500,
  UNKNOWN_LIFECYCLE: 404,
  UNKNOWN_TRANSITION: 404,
  RECORD_NOT_FOUND: 404,
  GUARD_REJECTED: 403,
  INVALID_STATE: 409,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  INVALID_ROUTE: 400,
  INVALID_SET: 400,
};

const EXAMPLE_STATUS: Record<ExampleError['code'], ContentfulStatusCode> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID: 400,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function body(context: Context): Promise<Record<string, unknown>> {
  const parsed: unknown = await context.req.json().catch(() => ({}));
  return isObject(parsed) ? parsed : {};
}

/**
 * The pages switch between the example's people so one person can try every
 * role. A real application takes the actor from `context.get('auth')` and
 * authorizes the action.
 */
function actor(value: unknown): string {
  if (!person(value)) throw new ExampleError('INVALID', '请选择当前身份');
  return text(value);
}

function failures(value: unknown): number {
  const count = Number(value ?? 0);
  if (!Number.isInteger(count) || count < 0)
    throw new ExampleError('INVALID', '模拟失败次数必须是非负整数');
  return count;
}

function expenseDraft(values: Record<string, unknown>): ExpenseDraft {
  return {
    title: text(values.title).trim(),
    purpose: text(values.purpose),
    items: parseItems(values.items),
    failPayments: failures(values.failPayments),
  };
}

function lifecycleName(value: string): ExampleLifecycleName {
  if (value === 'tickets' || value === 'expenses') return value;
  throw new ExampleError('NOT_FOUND', `没有 ${value}`);
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<AuthEnv>();
    const authentication = container.resolve(authenticationToken);
    const service = container.resolve(lifecycleExampleServiceToken);

    router.use('/lifecycle-example/*', authentication.required());
    router.onError((error, context) => {
      if (error instanceof LifecycleError)
        return context.json(
          {
            code: error.code,
            message: error.message,
            blockers: error.blockers,
            problems: error.problems,
          },
          LIFECYCLE_STATUS[error.code],
        );
      if (error instanceof ExampleError)
        return context.json(
          { code: error.code, message: error.message },
          EXAMPLE_STATUS[error.code],
        );
      throw error;
    });

    // Sweeps the triggers now, so the page need not wait for the schedule.
    router.post('/lifecycle-example/triggers/run', async (context) =>
      context.json({ fired: await service.runTriggers() }),
    );

    router.get('/lifecycle-example/tickets', async (context) =>
      context.json({
        records: await service.listTickets(actor(context.req.query('actAs'))),
        parameters: service.parameters('tickets'),
      }),
    );
    router.post('/lifecycle-example/tickets', async (context) => {
      const values = await body(context);
      return context.json(
        await service.createTicket(
          {
            subject: text(values.subject).trim(),
            category: text(values.category),
            priority: text(values.priority),
            description: text(values.description),
            failNotifications: failures(values.failNotifications),
          },
          actor(values.actAs),
        ),
        201,
      );
    });

    router.get('/lifecycle-example/expenses', async (context) =>
      context.json({
        records: await service.listExpenses(
          actor(context.req.query('actAs')),
          context.req.query('view') === 'approvals' ? 'approvals' : 'mine',
        ),
        parameters: service.parameters('expenses'),
      }),
    );
    router.post('/lifecycle-example/expenses', async (context) => {
      const values = await body(context);
      return context.json(
        await service.createExpense(expenseDraft(values), actor(values.actAs)),
        201,
      );
    });
    router.put('/lifecycle-example/expenses/:id', async (context) => {
      const values = await body(context);
      await service.updateExpense(
        context.req.param('id'),
        expenseDraft(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });

    router.get('/lifecycle-example/:name/:id', async (context) =>
      context.json(
        await service.detail(
          lifecycleName(context.req.param('name')),
          context.req.param('id'),
          actor(context.req.query('actAs')),
        ),
      ),
    );
    router.post('/lifecycle-example/:name/:id/fire', async (context) => {
      const values = await body(context);
      if (typeof values.transition !== 'string')
        throw new ExampleError('INVALID', '请选择操作');
      return context.json(
        await service.fire(
          lifecycleName(context.req.param('name')),
          context.req.param('id'),
          values.transition,
          isObject(values.input) ? (values.input as JsonObject) : {},
          actor(values.actAs),
        ),
      );
    });

    return new Hono().route('/', router);
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
