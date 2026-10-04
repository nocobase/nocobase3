import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  NODE_RUN_STATUS,
  workflowServiceToken,
} from '@nocobase/app-plugin-workflow/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  parseApiInput,
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  RepositoryError,
  type FilterBuilder,
  type Row,
} from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { validator } from 'hono/validator';
import { EXAMPLES_APP_DOMAIN } from './domain.js';
import {
  QuotationReviewParams,
  QuotationReviewQuery,
  QuotationReviewDecision,
} from './schemas.js';

const nodeKey = 'awaitRoutingConfirmation';
function runIdOf(row: Row): string {
  if (typeof row.runId !== 'string' && typeof row.runId !== 'number')
    throw new TypeError('Review task has no workflow run id.');
  return String(row.runId);
}

export const quotationReviewTaskRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    routes.onError(apiErrorHandler);
    if (
      !app.container.has(databaseManagerToken) ||
      !app.container.has(workflowServiceToken)
    ) {
      routes.all('*', () => {
        throw new ApiError({
          status: 'UNAVAILABLE',
          reason: 'SERVICE_UNAVAILABLE',
          domain: EXAMPLES_APP_DOMAIN,
          message: 'Quotation review services are not configured.',
        });
      });
      return router.route('/quotationReviewTasks', routes);
    }
    const database = app.container.resolve(databaseManagerToken);
    const repository = database.repository('quotationReviewTasks');
    const wait = app.container
      .resolve(workflowServiceToken)
      .getInstructionApi('wait');
    const auth = app.container.resolve(authenticationToken);
    routes.use(
      '*',
      auth.required(),
      bodyLimit({
        maxSize: 8 * 1024,
        onError: (c) =>
          apiErrorHandler(
            new ApiError({
              status: 'INVALID_ARGUMENT',
              reason: 'BODY_TOO_LARGE',
              domain: EXAMPLES_APP_DOMAIN,
              message: 'The decision exceeds 8 KiB.',
              httpStatus: 413,
            }),
            c,
          ),
      }),
    );

    const withWaitStatus = async (row: Row) => {
      const [lookup, resumeRequest] = await Promise.all([
        wait.getPending({ runId: runIdOf(row), nodeKey }),
        typeof row.resumeRequestId === 'string'
          ? wait.getRequest(row.resumeRequestId)
          : Promise.resolve(null),
      ]);
      return {
        ...row,
        id: String(row.id),
        waitStatus: lookup.status,
        resumeRequest,
      };
    };

    routes.get(
      '/',
      validator('query', (value) => parseApiInput(QuotationReviewQuery, value)),
      async (c) => {
        const { page, pageSize, q: search, status } = c.req.valid('query');
        const filter =
          search || status !== 'all'
            ? {
                filter: (f: FilterBuilder) =>
                  f.and([
                    ...(search
                      ? [f.string('quotationId').includes(search)]
                      : []),
                    ...(status !== 'all'
                      ? [f.string('status').eq(status)]
                      : []),
                  ]),
              }
            : {};
        const [total, rows] = await Promise.all([
          repository.count(filter),
          repository.findMany({
            ...filter,
            sort: (sort) => [
              sort.field('createdAt').desc(),
              sort.field('id').desc(),
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
        ]);
        return c.json({
          data: await Promise.all(rows.map(withWaitStatus)),
          meta: { total, page, pageSize },
        });
      },
    );

    routes.get(
      '/:taskId',
      validator('param', (value) =>
        parseApiInput(QuotationReviewParams, value),
      ),
      async (c) => {
        const { taskId: id } = c.req.valid('param');
        const row = await repository.findOne({ filter: { id } });
        if (!row)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'NOT_FOUND',
            domain: EXAMPLES_APP_DOMAIN,
            message: 'Quotation review task was not found.',
          });
        const user = c.get('auth')!.user;
        return c.json({
          data: await withWaitStatus(row),
          meta: {
            currentReviewer: { id: user.id, name: user.name || user.id },
          },
        });
      },
    );

    routes.post(
      '/:taskId/submit',
      validator('param', (value) =>
        parseApiInput(QuotationReviewParams, value),
      ),
      validator('json', (value) =>
        parseApiInput(QuotationReviewDecision, value),
      ),
      async (c) => {
        const { taskId: id } = c.req.valid('param');
        const input = c.req.valid('json');
        let row = await repository.findOne({ filter: { id } });
        if (!row)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'NOT_FOUND',
            domain: EXAMPLES_APP_DOMAIN,
            message: 'Quotation review task was not found.',
          });
        if (row.status === 'submitted' || row.status === 'unavailable')
          throw new ApiError({
            status: 'ABORTED',
            reason: 'ALREADY_SUBMITTED',
            domain: EXAMPLES_APP_DOMAIN,
            message: 'The decision has already been submitted.',
          });
        const user = c.get('auth')!.user;
        const reviewerId = String(user.id);
        const confirmedBy = (user.name || reviewerId).slice(0, 100);
        if (row.status === 'pending') {
          const lookup = await wait.getPending({
            runId: runIdOf(row),
            nodeKey,
          });
          if (lookup.status !== 'pending')
            throw new ApiError({
              status: 'ABORTED',
              reason: 'WAIT_NOT_PENDING',
              domain: EXAMPLES_APP_DOMAIN,
              message: `Workflow wait is ${lookup.status}.`,
            });
          try {
            // The conditional update chooses one decision before the Wait request is queued.
            await repository.updateOne({
              filter: { id, status: 'pending' },
              values: {
                status: 'submitting',
                reviewerId,
                confirmedBy,
                decision: input.decision,
                comment: input.comment,
              },
            });
          } catch (error) {
            if (
              error instanceof RepositoryError &&
              error.code === 'RECORD_NOT_FOUND'
            )
              throw new ApiError({
                status: 'ABORTED',
                reason: 'ALREADY_CLAIMED',
                domain: EXAMPLES_APP_DOMAIN,
                message: 'Another decision has already claimed this task.',
              });
            throw error;
          }
          row = (await repository.findOne({ filter: { id } }))!;
        }
        if (
          row.status !== 'submitting' ||
          row.decision !== input.decision ||
          row.comment !== input.comment
        )
          throw new ApiError({
            status: 'ABORTED',
            reason: 'ALREADY_CLAIMED',
            domain: EXAMPLES_APP_DOMAIN,
            message: 'Another decision has already claimed this task.',
          });
        const receipt = await wait.resume({
          runId: runIdOf(row),
          nodeKey,
          status: NODE_RUN_STATUS.RESOLVED,
          result: {
            taskId: id,
            reviewerId: row.reviewerId,
            confirmedBy: row.confirmedBy,
            decision: row.decision,
            comment: row.comment,
          },
          idempotencyKey: `quotation-review-task-${id}`,
        });
        if (
          ['run-ended', 'run-not-found', 'node-not-found', 'finished'].includes(
            receipt.status,
          )
        ) {
          await repository.updateOne({
            filter: { id, status: 'submitting' },
            values: { status: 'unavailable' },
          });
        }
        if (receipt.status !== 'accepted' && receipt.status !== 'duplicate')
          throw new ApiError({
            status: 'ABORTED',
            reason: 'WAIT_NOT_PENDING',
            domain: EXAMPLES_APP_DOMAIN,
            message: `Workflow wait is ${receipt.status}.`,
          });
        // Repeated deliveries of the same decision may both get a receipt.
        // Updating conditionally makes storing that receipt idempotent too.
        await repository.updateMany({
          filter: { id, status: 'submitting' },
          values: {
            status: 'submitted',
            resumeRequestId: receipt.requestId,
            submittedAt: new Date(),
          },
        });
        const updated = await repository.findOne({ filter: { id } });
        return c.json({ data: await withWaitStatus(updated!) });
      },
    );

    return router.route('/quotationReviewTasks', routes);
  });
