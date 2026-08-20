import { Hono } from 'hono';

import type { WorkflowService } from '../../services/index.js';

export function createWorkflowRoutes(options: { workflow: WorkflowService }): Hono {
  const routes = new Hono();
  routes.get('/workflows', async (context) => context.json({ data: await options.workflow.list() }));
  routes.get('/workflow-runs', async (context) => context.json({ data: await options.workflow.runs() }));
  routes.get('/workflows/:id/runs', async (context) => context.json({ data: await options.workflow.runsForWorkflow(context.req.param('id')) }));
  routes.get('/workflows/:id/inputs', async (context) => context.json({ data: await options.workflow.getInputs(context.req.param('id')) }));
  routes.put('/workflows/:id/inputs', async (context) => context.json({ data: await options.workflow.updateInputs(context.req.param('id'), await readBody(context.req.raw)) }));
  routes.post('/workflows/:id/enable', async (context) => context.json({ data: await options.workflow.enable(context.req.param('id')) }));
  routes.post('/workflows/:id/disable', async (context) => context.json({ data: await options.workflow.disable(context.req.param('id')) }));
  routes.post('/workflows/:id/run', async (context) => context.json({ data: await options.workflow.run(context.req.param('id'), await readBody(context.req.raw)) }));
  return routes;
}

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? request.json() : {};
}
