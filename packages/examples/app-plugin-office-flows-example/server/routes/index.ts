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

import {
  emptyDataRequest,
  type DataRequestForm,
} from '../../shared/data-request.js';
import { isPerson } from '../../shared/people.js';
import { OfficeFlowsError, type RowInput } from '../services/office-flows.js';
import type { TaskKind } from '../services/store.js';
import { officeFlowsServiceToken } from '../tokens.js';
import { text } from '../../shared/text.js';

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

const SERVICE_STATUS: Record<OfficeFlowsError['code'], ContentfulStatusCode> = {
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

function taskKind(value: string): TaskKind {
  if (value === 'clerk' || value === 'team' || value === 'executor')
    return value;
  throw new OfficeFlowsError('NOT_FOUND', `没有 ${value} 类子单`);
}

/**
 * The pages pick who they act as, so one person can play every role; the
 * persona must be one of the example's cast. A real application takes the
 * actor from `context.get('auth')` and authorizes the action.
 */
function actor(value: unknown): string {
  if (!isPerson(value))
    throw new OfficeFlowsError('INVALID', '请选择扮演的人员');
  return value;
}

function input(values: Record<string, unknown>): JsonObject {
  return isObject(values.input) ? (values.input as JsonObject) : {};
}

function form(values: Record<string, unknown>): DataRequestForm {
  const empty = emptyDataRequest();
  const source = isObject(values.form) ? values.form : {};
  return Object.fromEntries(
    Object.entries(empty).map(([key, fallback]) => [
      key,
      key in source ? source[key] : fallback,
    ]),
  ) as unknown as DataRequestForm;
}

function rowInput(values: Record<string, unknown>): RowInput {
  return {
    departmentName: text(values.departmentName ?? ''),
    includeClerks: values.includeClerks !== false,
    includeHeads: values.includeHeads === true,
    includeLeaders: values.includeLeaders === true,
    assistOther: values.assistOther === true,
  };
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<AuthEnv>();
    const authentication = container.resolve(authenticationToken);
    const service = container.resolve(officeFlowsServiceToken);

    router.use('/office-flows/*', authentication.required());
    router.onError((error, context) => {
      if (error instanceof LifecycleError)
        return context.json(
          { code: error.code, message: error.message },
          LIFECYCLE_STATUS[error.code],
        );
      if (error instanceof OfficeFlowsError)
        return context.json(
          { code: error.code, message: error.message },
          SERVICE_STATUS[error.code],
        );
      throw error;
    });

    // Reference data and the persona's reminders
    router.get('/office-flows/config', async (context) =>
      context.json(await service.config()),
    );
    router.get('/office-flows/notices', async (context) =>
      context.json({
        notices: await service.notices(actor(context.req.query('actAs'))),
      }),
    );
    router.post('/office-flows/sweep', async (context) =>
      context.json({ created: await service.runSchedule() }),
    );

    // Data usage requests
    router.get('/office-flows/data-requests', async (context) =>
      context.json({ records: await service.listDataRequests() }),
    );
    router.post('/office-flows/data-requests', async (context) => {
      const values = await body(context);
      return context.json(
        await service.createDataRequest(form(values), actor(values.actAs)),
        201,
      );
    });
    router.get('/office-flows/data-requests/:id', async (context) =>
      context.json(
        await service.dataRequestDetail(
          context.req.param('id'),
          actor(context.req.query('actAs')),
        ),
      ),
    );
    router.put('/office-flows/data-requests/:id', async (context) => {
      const values = await body(context);
      await service.updateDataRequest(
        context.req.param('id'),
        form(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/data-requests/:id/fire', async (context) => {
      const values = await body(context);
      await service.fire(
        'dataRequests',
        context.req.param('id'),
        text(values.transition),
        input(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post(
      '/office-flows/data-requests/:id/extractions',
      async (context) => {
        const values = await body(context);
        await service.createManualExtraction(
          context.req.param('id'),
          {
            topic: text(values.topic ?? ''),
            requirement: text(values.requirement ?? ''),
            scheduledDate: text(values.scheduledDate ?? ''),
            executorIds: Array.isArray(values.executorIds)
              ? values.executorIds.filter(isPerson)
              : [],
          },
          actor(values.actAs),
        );
        return context.body(null, 201);
      },
    );

    // Extraction tasks
    router.get('/office-flows/extractions/:id', async (context) =>
      context.json(
        await service.extractionDetail(
          context.req.param('id'),
          actor(context.req.query('actAs')),
        ),
      ),
    );
    router.put('/office-flows/extractions/:id', async (context) => {
      const values = await body(context);
      await service.updateExtraction(
        context.req.param('id'),
        isObject(values.values) ? values.values : {},
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/extractions/:id/fire', async (context) => {
      const values = await body(context);
      await service.fire(
        'extractions',
        context.req.param('id'),
        text(values.transition),
        input(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });

    // Incoming documents
    router.get('/office-flows/incoming', async (context) =>
      context.json({ records: await service.listIncoming() }),
    );
    router.post('/office-flows/incoming', async (context) => {
      const values = await body(context);
      return context.json(
        await service.createIncoming(
          isObject(values.values) ? values.values : {},
          actor(values.actAs),
        ),
        201,
      );
    });
    router.get('/office-flows/incoming/:id', async (context) =>
      context.json(
        await service.incomingDetail(
          context.req.param('id'),
          actor(context.req.query('actAs')),
        ),
      ),
    );
    router.put('/office-flows/incoming/:id', async (context) => {
      const values = await body(context);
      await service.updateIncoming(
        context.req.param('id'),
        isObject(values.values) ? values.values : {},
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/incoming/:id/fire', async (context) => {
      const values = await body(context);
      await service.fireIncoming(
        context.req.param('id'),
        text(values.transition),
        input(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/incoming/:id/rows', async (context) => {
      const values = await body(context);
      await service.addRow(
        'incoming',
        context.req.param('id'),
        rowInput(values),
        actor(values.actAs),
      );
      return context.body(null, 201);
    });
    router.post('/office-flows/incoming/:id/management', async (context) => {
      const values = await body(context);
      await service.addManagement(
        context.req.param('id'),
        {
          ...(typeof values.groupId === 'number'
            ? { groupId: values.groupId }
            : {}),
          ...(typeof values.groupName === 'string'
            ? { groupName: values.groupName }
            : {}),
          ...(Array.isArray(values.members)
            ? { members: values.members.map(String) }
            : {}),
        },
        actor(values.actAs),
      );
      return context.body(null, 201);
    });
    router.delete('/office-flows/management/:rowId', async (context) => {
      await service.removeManagement(
        context.req.param('rowId'),
        actor(context.req.query('actAs')),
      );
      return context.body(null, 204);
    });
    router.delete('/office-flows/rows/:rowId', async (context) => {
      await service.removeRow(
        context.req.param('rowId'),
        actor(context.req.query('actAs')),
      );
      return context.body(null, 204);
    });

    // Incoming-document tasks
    router.get('/office-flows/tasks', async (context) =>
      context.json({
        tasks: await service.myTasks(actor(context.req.query('actAs'))),
      }),
    );
    router.get('/office-flows/tasks/:kind/:id', async (context) =>
      context.json(
        await service.taskDetail(
          taskKind(context.req.param('kind')),
          context.req.param('id'),
          actor(context.req.query('actAs')),
        ),
      ),
    );
    router.put('/office-flows/tasks/:kind/:id', async (context) => {
      const values = await body(context);
      await service.updateTask(
        taskKind(context.req.param('kind')),
        context.req.param('id'),
        isObject(values.values) ? values.values : {},
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/tasks/:kind/:id/fire', async (context) => {
      const values = await body(context);
      await service.fireTask(
        taskKind(context.req.param('kind')),
        context.req.param('id'),
        text(values.transition),
        input(values),
        actor(values.actAs),
      );
      return context.body(null, 204);
    });
    router.post('/office-flows/tasks/:kind/:id/rows', async (context) => {
      const values = await body(context);
      const kind = taskKind(context.req.param('kind'));
      if (kind === 'executor')
        throw new OfficeFlowsError('INVALID', '执行人子单不能再派发');
      await service.addRow(
        kind,
        context.req.param('id'),
        rowInput(values),
        actor(values.actAs),
      );
      return context.body(null, 201);
    });

    return new Hono().route('/', router);
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
