import { Hono } from 'hono';

import type { WorkflowRunRepository } from '../repositories/workflow-run-repository.js';

export function createNodeRunRoutes(
  workflowRuns: Pick<WorkflowRunRepository, 'nodeRuns' | 'nodeRunPayload'>,
): Hono {
  const routes = new Hono();

  routes.get('/workflow-runs/:id/node-runs', async (c) =>
    c.json({
      data: await workflowRuns.nodeRuns(
        c.req.param('id'),
        c.req.query('nodeKey'),
      ),
    }),
  );

  routes.get(
    '/workflow-runs/:runId/node-runs/:nodeRunId/payload',
    async (c) => {
      const payload = await workflowRuns.nodeRunPayload(
        c.req.param('runId'),
        c.req.param('nodeRunId'),
      );
      return c.json({ data: payload });
    },
  );

  return routes;
}
