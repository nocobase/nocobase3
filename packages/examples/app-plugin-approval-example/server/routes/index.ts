import { ApprovalError } from '@nocobase/app-plugin-approval/server';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { LifecycleError, type JsonObject } from '@nocobase/lifecycle';
import {
  createLifecycleRoutes,
  LIFECYCLE_ERROR_STATUS,
} from '@nocobase/lifecycle/hono';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { EXAMPLE_ROUTES, LIFECYCLE_ROUTES } from '../../shared/routes.js';
import { LAB_APPROVALS, LAB_LIFECYCLES } from '../lab/catalog.js';
import { ApprovalCenter } from '../lab/center.js';
import { ExampleError } from '../lab/errors.js';
import {
  RECORD_ACTIONS,
  SIMULATED_EVENTS,
  TASK_ACTIONS,
} from '../lab/service.js';
import { approvalExampleServiceToken } from '../tokens.js';

const EXAMPLE_STATUS: Record<ExampleError['code'], ContentfulStatusCode> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID: 400,
};

/** How each refusal of the approval layer reads over HTTP. */
function approvalStatus(code: ApprovalError['code']): ContentfulStatusCode {
  switch (code) {
    case 'TASK_NOT_FOUND':
      return 404;
    case 'NOT_ASSIGNEE':
    case 'NOT_ALLOWED':
    case 'NOT_QUALIFIED':
    case 'INACTIVE':
      return 403;
    case 'CONFLICT':
    case 'STALE':
    case 'STALE_CONTENT':
    case 'CONTENT_CHANGED':
    case 'TASK_CLOSED':
    case 'ALREADY_ANSWERED':
      return 409;
    default:
      return 400;
  }
}

async function body(context: Context): Promise<JsonObject> {
  const value: unknown = await context.req.json().catch(() => ({}));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ExampleError('INVALID', 'input', 'Provide a JSON object.');
  return value as JsonObject;
}

function oneOf<T extends string>(
  value: string,
  options: readonly T[],
  what: string,
): T {
  if (!(options as readonly string[]).includes(value))
    throw new ExampleError('NOT_FOUND', what, `Unknown ${what} "${value}".`);
  return value as T;
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<AuthEnv>();
    const authentication = container.resolve(authenticationToken);
    const service = container.resolve(approvalExampleServiceToken);
    const center = new ApprovalCenter(service);
    const base = `/${EXAMPLE_ROUTES}`;

    router.use(`${base}/*`, authentication.required());
    router.onError((error, context) => {
      if (error instanceof LifecycleError)
        return context.json(
          {
            code: error.code,
            message: error.message,
            blockers: error.blockers,
            problems: error.problems,
          },
          LIFECYCLE_ERROR_STATUS[error.code],
        );
      if (error instanceof ApprovalError)
        return context.json(
          { code: error.code, message: error.message },
          approvalStatus(error.code),
        );
      if (error instanceof ExampleError)
        return context.json(
          { code: error.code, reason: error.reason, message: error.message },
          EXAMPLE_STATUS[error.code],
        );
      throw error;
    });

    /**
     * The pages switch between the example's personas so one person can try
     * every role. A real application takes the actor from
     * `context.get('auth')` and authorizes each read.
     */
    const actor = (context: Context): string =>
      service.actor(context.req.query('actAs'));

    router.get(`${base}/overview`, async (context) =>
      context.json(await center.overview(actor(context))),
    );
    router.get(`${base}/records/:lifecycle/:id`, async (context) =>
      context.json(
        await center.detail(
          context.req.param('lifecycle'),
          context.req.param('id'),
          actor(context),
        ),
      ),
    );
    router.post(`${base}/preview/:demo`, async (context) =>
      context.json(
        await center.preview(
          context.req.param('demo'),
          await body(context),
          actor(context),
        ),
      ),
    );
    router.post(`${base}/requests/:demo`, async (context) =>
      context.json(
        await service.create(
          context.req.param('demo'),
          await body(context),
          actor(context),
        ),
        201,
      ),
    );
    router.post(`${base}/samples`, async (context) =>
      context.json({ created: await service.loadSamples(actor(context)) }),
    );
    router.post(`${base}/sweep`, async (context) => {
      actor(context);
      return context.json({ moved: await service.sweep() });
    });
    router.put(`${base}/settings`, async (context) => {
      await service.saveSettings(await body(context), actor(context));
      return context.body(null, 204);
    });
    router.post(`${base}/tasks/:taskId/:action`, async (context) =>
      context.json(
        await service.taskAction(
          context.req.param('taskId'),
          oneOf(context.req.param('action'), TASK_ACTIONS, 'task action'),
          await body(context),
          actor(context),
        ),
      ),
    );
    router.post(`${base}/records/:lifecycle/:id/:action`, async (context) =>
      context.json(
        await service.recordAction(
          context.req.param('lifecycle'),
          context.req.param('id'),
          oneOf(context.req.param('action'), RECORD_ACTIONS, 'record action'),
          await body(context),
          actor(context),
        ),
      ),
    );
    router.post(`${base}/events/:event/:id`, async (context) =>
      context.json(
        await service.simulate(
          oneOf(context.req.param('event'), SIMULATED_EVENTS, 'event'),
          context.req.param('id'),
          await body(context),
          actor(context),
        ),
      ),
    );

    // A record's own routes — view, fire a transition, and operate its
    // effect runs — are the library's. The approval runs' lifecycles are
    // read through the detail route and moved only by the approval layer.
    router.route(
      `/${LIFECYCLE_ROUTES}`,
      createLifecycleRoutes(service.runtime, {
        lifecycles: [
          ...LAB_LIFECYCLES.map((lifecycle) => lifecycle.name),
          ...LAB_APPROVALS.map((approval) => approval.lifecycle.name),
        ],
        actor: (context) => ({ id: actor(context) }),
        // Any signed-in demo user may inspect the sample records; guards
        // authorize business actions, and only the administrator operates
        // effect runs.
        authorize: (access, identity) =>
          access.action !== 'operate' ||
          service.directory().hasRole(identity.id, 'approvalAdmin'),
      }),
    );

    return new Hono().route('/', router);
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
