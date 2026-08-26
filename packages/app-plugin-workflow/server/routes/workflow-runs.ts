import { Hono } from 'hono';

import {
  parseStatus,
  readContext,
  readPage,
  toPageResponse,
} from './helpers.js';
import type { WorkflowRunRepository } from '../services/workflow-run-repository.js';

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
    const data = await workflowRuns.run(
      c.req.param('id'),
      await readContext(c.req.raw),
      { eventKey: c.req.header('event-key') ?? undefined },
    );
    return c.json({ data });
  });

  return routes;
}
