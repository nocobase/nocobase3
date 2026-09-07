import { captureWorkflowHttpRun } from '../audit-internal.js';
import { EXECUTION_STATUS } from '../engine/constants.js';
import { BadRequestError } from '../errors.js';
import { Hono } from 'hono';

import { parseStatus, readInput, readPage, toPageResponse } from './helpers.js';
import type { WorkflowRunRepository } from '../repositories/workflow-run-repository.js';

export function createWorkflowRunRoutes(
  workflowRuns: Pick<
    WorkflowRunRepository,
    'list' | 'listForWorkflow' | 'get' | 'run'
  >,
): Hono {
  const routes = new Hono();

  routes.get('/workflow-runs', async (c) => {
    const status = parseStatus(c.req.query('status'));
    const page = await workflowRuns.list({
      workflowKey: c.req.query('workflowKey'),
      workflowTitle: c.req.query('workflowTitle'),
      ...(status === undefined ? {} : { status }),
      ...readPage(c.req.query('page'), c.req.query('pageSize')),
    });
    return c.json(toPageResponse(page));
  });

  routes.get('/workflow-runs/:id', async (c) =>
    c.json({ data: await workflowRuns.get(c.req.param('id')) }),
  );

  routes.get('/workflows/:id/runs', async (c) =>
    c.json({ data: await workflowRuns.listForWorkflow(c.req.param('id')) }),
  );

  routes.post('/workflows/:id/run', async (c) => {
    const enqueue = c.req.query('enqueue');
    if (enqueue !== undefined && enqueue !== 'true' && enqueue !== 'false')
      throw new BadRequestError('Invalid workflow enqueue option');
    const data = await workflowRuns.run(
      c.req.param('id'),
      await readInput(c.req.raw),
      {
        eventKey: c.req.header('event-key') ?? undefined,
        ...(enqueue === 'true' ? { enqueueOnly: true } : {}),
      },
    );
    await captureWorkflowHttpRun(c, String(data.id));
    const terminal =
      data.status === EXECUTION_STATUS.RESOLVED ||
      data.status === EXECUTION_STATUS.FAILED ||
      data.status === EXECUTION_STATUS.ERROR ||
      data.status === EXECUTION_STATUS.ABORTED;
    return c.json({ data }, enqueue === 'true' && !terminal ? 202 : 200);
  });

  return routes;
}
