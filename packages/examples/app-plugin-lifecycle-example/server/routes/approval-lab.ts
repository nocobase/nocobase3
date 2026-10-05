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

import { ApprovalCenterService } from '../approval-center/service.js';
import { actionForms } from '../approval-lab/forms.js';
import { LAB_LIFECYCLES } from '../approval-lab/definitions.js';
import { ExampleError } from '../services/lifecycle-example.js';
import { approvalLabServiceToken } from '../tokens.js';

async function body(context: Context): Promise<JsonObject> {
  const value: unknown = await context.req.json().catch(() => undefined);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ExampleError('INVALID', 'input', 'Provide a JSON object.');
  return value as JsonObject;
}

export const approvalLabRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<AuthEnv>();
    const service = container.resolve(approvalLabServiceToken);
    const center = new ApprovalCenterService(service);
    router.use(
      '/lifecycle-example/approval-lab/*',
      container.resolve(authenticationToken).required(),
    );
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
      if (error instanceof ExampleError)
        return context.json(
          { code: error.code, message: error.message },
          error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'NOT_FOUND'
              ? 404
              : 400,
        );
      throw error;
    });
    const actor = (context: Context): string =>
      service.actor(context.req.query('actAs'));
    router.get('/lifecycle-example/approval-lab/overview', async (context) =>
      context.json(await service.overview(actor(context))),
    );
    // The approval center reads the same records as business requests.
    router.get('/lifecycle-example/approval-lab/center', async (context) =>
      context.json(await center.overview(actor(context))),
    );
    router.post(
      '/lifecycle-example/approval-lab/center/preview/:key',
      async (context) => {
        const values = await body(context);
        const applicant =
          typeof values.applicantId === 'string'
            ? service.actor(values.applicantId)
            : actor(context);
        return context.json(
          center.preview(
            context.req.param('key'),
            typeof values.content === 'object' &&
              values.content !== null &&
              !Array.isArray(values.content)
              ? values.content
              : {},
            applicant,
          ),
        );
      },
    );
    router.post(
      '/lifecycle-example/approval-lab/create/:key',
      async (context) =>
        context.json(
          await service.create(
            context.req.param('key'),
            await body(context),
            actor(context),
          ),
          201,
        ),
    );
    router.put('/lifecycle-example/approval-lab/settings', async (context) => {
      await service.saveSettings(await body(context), actor(context));
      return context.body(null, 204);
    });
    router.post('/lifecycle-example/approval-lab/samples', async (context) =>
      context.json({ created: await service.loadSamples(actor(context)) }),
    );
    router.post('/lifecycle-example/approval-lab/sweep', async (context) => {
      actor(context);
      return context.json({ fired: await service.sweep() });
    });
    router.post(
      '/lifecycle-example/approval-lab/events/:name/:id',
      async (context) => {
        const values = await body(context);
        if (
          typeof values.transition !== 'string' ||
          typeof values.version !== 'number' ||
          typeof values.input !== 'object' ||
          values.input === null ||
          Array.isArray(values.input)
        )
          throw new ExampleError(
            'INVALID',
            'event',
            'Provide a transition, input and record version.',
          );
        await service.simulate(
          context.req.param('name'),
          context.req.param('id'),
          values.transition,
          values.input,
          values.version,
          actor(context),
        );
        return context.body(null, 204);
      },
    );
    router.get(
      '/lifecycle-example/approval-lab/forms/:name/:id',
      async (context) => {
        const identity = actor(context);
        const name = context.req.param('name');
        if (!LAB_LIFECYCLES.some((item) => item.name === name))
          throw new ExampleError(
            'NOT_FOUND',
            'lifecycle',
            'Unknown approval lifecycle.',
          );
        const view = await service.runtime.view(name, context.req.param('id'), {
          id: identity,
        });
        return context.json(
          actionForms(
            name,
            view.record,
            identity,
            name === 'approvalRequests'
              ? await service.trail(view.record)
              : null,
          ),
        );
      },
    );
    // The stages, to-dos and handling log of a staged approval request.
    router.get(
      '/lifecycle-example/approval-lab/approvals/:id',
      async (context) => {
        actor(context);
        const view = await service.runtime.view(
          'approvalRequests',
          context.req.param('id'),
          { id: actor(context) },
        );
        return context.json(await service.trail(view.record));
      },
    );
    router.route(
      '/lifecycle-example/approval-lab/lifecycles',
      createLifecycleRoutes(service.runtime, {
        lifecycles: LAB_LIFECYCLES.map((item) => item.name),
        actor: (context) => ({ id: actor(context) }),
        // This signed-in demonstration allows everyone to inspect sample records;
        // guards authorize business actions, and only admin operates effect runs.
        authorize: (access, identity) =>
          access.action !== 'operate' || identity.id === 'admin',
      }),
    );
    return new Hono().route('/', router);
  });
