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

const nodeKey = 'awaitRoutingConfirmation';
const pageSize = 12;

function parseDecision(
  value: unknown,
): { decision: 'approved' | 'rejected'; comment: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !['decision', 'comment'].includes(key)) ||
    (input.decision !== 'approved' && input.decision !== 'rejected') ||
    typeof input.comment !== 'string' ||
    input.comment.length > 2000
  )
    return;
  return { decision: input.decision, comment: input.comment.trim() };
}

function runIdOf(row: Row): string {
  if (typeof row.runId !== 'string' && typeof row.runId !== 'number')
    throw new TypeError('Review task has no workflow run id.');
  return String(row.runId);
}

export const quotationReviewTaskRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    if (
      !app.container.has(databaseManagerToken) ||
      !app.container.has(workflowServiceToken)
    ) {
      routes.all('*', (c) => c.json({ code: 'SERVICE_UNAVAILABLE' }, 503));
      return router.route('/quotation-review-tasks', routes);
    }
    const database = app.container.resolve(databaseManagerToken);
    const repository = database.repository('quotationReviewTasks');
    const wait = app.container
      .resolve(workflowServiceToken)
      .getInstructionApi('wait');
    const auth = app.container.resolve(authenticationToken);
    routes.use('*', auth.required(), bodyLimit({ maxSize: 8 * 1024 }));

    const withWaitStatus = async (row: Row) => {
      const [lookup, resumeRequest] = await Promise.all([
        wait.getPending({ runId: runIdOf(row), nodeKey }),
        typeof row.resumeRequestId === 'string'
          ? wait.getRequest(row.resumeRequestId)
          : Promise.resolve(null),
      ]);
      return { ...row, waitStatus: lookup.status, resumeRequest };
    };

    routes.get('/', async (c) => {
      const page = Number(c.req.query('page') ?? '1');
      const search = (c.req.query('search') ?? '').trim();
      const status = c.req.query('status') ?? 'all';
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 10000 ||
        search.length > 64 ||
        !['all', 'pending', 'submitting', 'submitted', 'unavailable'].includes(
          status,
        )
      )
        return c.json({ code: 'INVALID_QUERY' }, 400);
      const filter =
        search || status !== 'all'
          ? {
              filter: (f: FilterBuilder) =>
                f.and([
                  ...(search ? [f.string('quotationId').includes(search)] : []),
                  ...(status !== 'all' ? [f.string('status').eq(status)] : []),
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
        total,
        page,
        pageSize,
      });
    });

    routes.get('/:id', async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isSafeInteger(id) || id < 1)
        return c.json({ code: 'INVALID_ID' }, 400);
      const row = await repository.findOne({ filter: { id } });
      if (!row) return c.json({ code: 'NOT_FOUND' }, 404);
      const user = c.get('auth')!.user;
      return c.json({
        data: await withWaitStatus(row),
        currentReviewer: { id: user.id, name: user.name || user.id },
      });
    });

    routes.post('/:id/submit', async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isSafeInteger(id) || id < 1)
        return c.json({ code: 'INVALID_ID' }, 400);
      const input = parseDecision(await c.req.json().catch(() => null));
      if (!input) return c.json({ code: 'INVALID_DECISION' }, 400);
      let row = await repository.findOne({ filter: { id } });
      if (!row) return c.json({ code: 'NOT_FOUND' }, 404);
      if (row.status === 'submitted' || row.status === 'unavailable')
        return c.json({ code: 'ALREADY_SUBMITTED' }, 409);
      const user = c.get('auth')!.user;
      const reviewerId = String(user.id);
      const confirmedBy = (user.name || reviewerId).slice(0, 100);
      if (row.status === 'pending') {
        const lookup = await wait.getPending({
          runId: runIdOf(row),
          nodeKey,
        });
        if (lookup.status !== 'pending')
          return c.json(
            { code: 'WAIT_NOT_PENDING', waitStatus: lookup.status },
            409,
          );
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
            return c.json({ code: 'ALREADY_CLAIMED' }, 409);
          throw error;
        }
        row = (await repository.findOne({ filter: { id } }))!;
      }
      if (
        row.status !== 'submitting' ||
        row.decision !== input.decision ||
        row.comment !== input.comment
      )
        return c.json({ code: 'ALREADY_CLAIMED' }, 409);
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
        return c.json(
          { code: 'WAIT_NOT_PENDING', waitStatus: receipt.status },
          409,
        );
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
    });

    return router.route('/quotation-review-tasks', routes);
  });
