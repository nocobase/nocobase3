import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { JsonObject } from '@nocobase/lifecycle';
import { Hono } from 'hono';
import { z } from 'zod';
import { DEMOS } from '../../shared/catalog.js';
import { EXAMPLE_ROUTES, LIFECYCLE_ROUTES } from '../../shared/routes.js';
import { LAB_APPROVALS, LAB_LIFECYCLES } from '../lab/catalog.js';
import { ApprovalCenter } from '../lab/center.js';
import { SIMULATED_EVENTS } from '../lab/service.js';
import { approvalExampleServiceToken } from '../tokens.js';
import { toApiError, tags, outwardView } from './api.js';
import { lifecycleRoutes } from './lifecycle.js';
import {
  OverviewSchema,
  RecordSummarySchema,
  RecordDetailSchema,
  PreviewSchema,
  CreatedSchema,
  SettingsInput,
  EmptyInput,
  TaskInputs,
  RecordInputs,
  EventInput,
} from './schemas.js';

const Query = z.object({ actAs: z.string().min(1) });
const DetailParams = z.object({
  lifecycle: z.string().min(1),
  id: z.string().regex(/^\d+$/),
});
// A scenario form declares every field of its sample; service validation decides which are required for that scenario.
function formSchema(sample: JsonObject): z.ZodType<JsonObject> {
  const field = (value: unknown): z.ZodType => {
    if (typeof value === 'string') return z.string();
    if (typeof value === 'number') return z.number();
    if (typeof value === 'boolean') return z.boolean();
    if (Array.isArray(value))
      return z.array(value.length ? field(value[0]) : z.json());
    if (value && typeof value === 'object')
      return z.object(
        Object.fromEntries(
          Object.entries(value).map(([key, v]) => [key, field(v)]),
        ),
      );
    return z.json();
  };
  return z.strictObject({
    ...Object.fromEntries(
      Object.entries(sample).map(([key, value]) => [
        key,
        field(value).optional(),
      ]),
    ),
    title: z.string().optional(),
    applicantId: z.string().optional(),
  });
}
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<AuthEnv>();
    const authentication = container.resolve(authenticationToken);
    const service = container.resolve(approvalExampleServiceToken);
    const center = new ApprovalCenter(service);
    const base = `/${EXAMPLE_ROUTES}`;
    router.use(`${base}/*`, authentication.required());
    router.use(`${base}/*`, async (context, next) => {
      service.actor(context.req.query('actAs'));
      await next();
    });
    router.onError((error, context) => {
      const mapped = toApiError(error);
      if (mapped instanceof ApiError) return apiErrorHandler(mapped, context);
      throw mapped;
    });
    const admin = async (
      context: import('hono').Context,
      next: import('hono').Next,
    ): Promise<void> => {
      if (
        !service
          .directory()
          .hasRole(service.actor(context.req.query('actAs')), 'approvalAdmin')
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ADMIN_REQUIRED',
          domain: EXAMPLE_ROUTES,
          message: 'Only an administrator may perform this operation.',
        });
      await next();
    };
    const describe = (operation: string, schema: z.ZodType, status = 200) =>
      describeRoute({
        tags,
        summary: operation.replace(/([A-Z])/g, ' $1'),
        operationId: `approvalExample${operation}`,
        responses: { [status]: dataResponse(schema), ...apiErrorResponses },
      });
    router.get(
      `${base}/overview`,
      describe('GetOverview', OverviewSchema),
      apiValidator('query', Query),
      async (c) =>
        c.json({ data: await center.overview(c.req.valid('query').actAs) }),
    );
    router.get(
      `${base}/records/:lifecycle/:id`,
      describe('GetRecordDetail', RecordDetailSchema),
      apiValidator('param', DetailParams),
      apiValidator('query', Query),
      async (c) => {
        const p = c.req.valid('param');
        return c.json({
          data: outwardView(
            await center.detail(p.lifecycle, p.id, c.req.valid('query').actAs),
          ),
        });
      },
    );
    router.get(
      `${base}/records`,
      describeRoute({
        tags,
        summary: 'List request records',
        operationId: 'approvalExampleListRecords',
        responses: {
          200: listResponse(RecordSummarySchema),
          ...apiErrorResponses,
          400: apiErrorResponse(400),
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
        },
      }),
      apiValidator(
        'query',
        Query.extend({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(100).default(20),
        }),
      ),
      async (c) => {
        const { actAs, page, pageSize } = c.req.valid('query');
        const all = (await center.overview(actAs)).records;
        return c.json({
          data: all.slice((page - 1) * pageSize, page * pageSize),
          meta: { page, pageSize, total: all.length },
        });
      },
    );
    for (const demo of DEMOS) {
      const input = formSchema(demo.sample());
      router.post(
        `${base}/preview/${demo.key}`,
        describe(`Preview${demo.key}`, PreviewSchema),
        apiValidator('query', Query),
        apiValidator('json', input),
        async (c) =>
          c.json({
            data: await center.preview(
              demo.key,
              c.req.valid('json'),
              c.req.valid('query').actAs,
            ),
          }),
      );
      router.post(
        `${base}/requests/${demo.key}`,
        describe(`Create${demo.key}`, CreatedSchema, 201),
        apiValidator('query', Query),
        apiValidator('json', input),
        async (c) =>
          c.json(
            {
              data: await service.create(
                demo.key,
                c.req.valid('json'),
                c.req.valid('query').actAs,
              ),
            },
            201,
          ),
      );
    }
    router.post(
      `${base}/samples`,
      admin,
      describe('LoadSamples', z.object({ created: z.number() })),
      apiValidator('query', Query),
      apiValidator('json', EmptyInput),
      async (c) =>
        c.json({
          data: {
            created: await service.loadSamples(c.req.valid('query').actAs),
          },
        }),
    );
    router.post(
      `${base}/sweep`,
      admin,
      describe('Sweep', z.object({ moved: z.number() })),
      apiValidator('query', Query),
      apiValidator('json', EmptyInput),
      async (c) => c.json({ data: { moved: await service.sweep() } }),
    );
    router.patch(
      `${base}/settings`,
      admin,
      describeRoute({
        tags,
        summary: 'Update settings',
        operationId: 'approvalExampleUpdateSettings',
        responses: { 204: emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('query', Query),
      apiValidator('json', SettingsInput),
      async (c) => {
        await service.saveSettings(
          c.req.valid('json') as JsonObject,
          c.req.valid('query').actAs,
        );
        return c.body(null, 204);
      },
    );
    // Action results are domain JSON: depending on the action, a task, an answer or a scenario result.
    const result = z.record(z.string(), z.json());
    for (const [action, input] of Object.entries(TaskInputs))
      router.post(
        `${base}/tasks/:taskId/${action}`,
        describe(`Task${action}`, result),
        apiValidator('param', z.object({ taskId: z.string().regex(/^\d+$/) })),
        apiValidator('query', Query),
        apiValidator('json', input),
        async (c) =>
          c.json({
            data: await service.taskAction(
              c.req.valid('param').taskId,
              action,
              c.req.valid('json'),
              c.req.valid('query').actAs,
            ),
          }),
      );
    for (const [action, input] of Object.entries(RecordInputs))
      router.post(
        `${base}/records/:lifecycle/:id/${action}`,
        describe(`Record${action}`, result),
        apiValidator('param', DetailParams),
        apiValidator('query', Query),
        apiValidator('json', input),
        async (c) => {
          const p = c.req.valid('param');
          return c.json({
            data: await service.recordAction(
              p.lifecycle,
              p.id,
              action,
              c.req.valid('json'),
              c.req.valid('query').actAs,
            ),
          });
        },
      );
    for (const event of SIMULATED_EVENTS)
      router.post(
        `${base}/events/${event}/:id`,
        admin,
        describe(`Simulate${event}`, result),
        apiValidator('param', z.object({ id: z.string().regex(/^\d+$/) })),
        apiValidator('query', Query),
        apiValidator('json', EventInput),
        async (c) =>
          c.json({
            data: await service.simulate(
              event,
              c.req.valid('param').id,
              c.req.valid('json'),
              c.req.valid('query').actAs,
            ),
          }),
      );
    for (const lifecycle of [
      ...LAB_LIFECYCLES,
      ...LAB_APPROVALS.map((a) => a.lifecycle),
    ])
      lifecycleRoutes(router, service.runtime, {
        basePath: `/${LIFECYCLE_ROUTES}`,
        lifecycle: lifecycle.name,
        noun: lifecycle.name.replace(/[^a-zA-Z0-9]/g, ''),
      });
    return new Hono().route('/', router).notFound((context) =>
      apiErrorHandler(
        new ApiError({
          status: 'NOT_FOUND',
          reason: 'ROUTE_NOT_FOUND',
          domain: EXAMPLE_ROUTES,
          message: 'No such approval example route.',
        }),
        context,
      ),
    );
  });
const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
