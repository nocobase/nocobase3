import { Hono } from 'hono';

import {
  parseBoolean,
  readBody,
  readEnabled,
  readInputValues,
  readPage,
  toPageResponse,
} from './helpers.js';
import type { WorkflowRepository } from '../services/workflow-repository.js';

export function createWorkflowDefinitionRoutes(
  workflows: Pick<
    WorkflowRepository,
    | 'list'
    | 'enable'
    | 'disable'
    | 'setStatus'
    | 'getInputs'
    | 'updateInputs'
    | 'get'
    | 'revisions'
  >,
): Hono {
  const routes = new Hono();

  routes.get('/workflows', async (c) => {
    const enabled = parseBoolean(c.req.query('enabled'));
    const page = await workflows.list({
      query: c.req.query('q'),
      ...(enabled === undefined ? {} : { enabled }),
      ...readPage(c.req.query('page'), c.req.query('pageSize')),
    });
    return c.json(toPageResponse(page));
  });

  routes.get('/workflows/:id', async (c) =>
    c.json({ data: await workflows.get(c.req.param('id')) }),
  );
  routes.get('/workflows/:id/revisions', async (c) =>
    c.json({ data: await workflows.revisions(c.req.param('id')) }),
  );
  routes.get('/workflows/:id/inputs', async (c) =>
    c.json({ data: await workflows.getInputs(c.req.param('id')) }),
  );
  routes.put('/workflows/:id/inputs', async (c) =>
    c.json({
      data: await workflows.updateInputs(
        c.req.param('id'),
        await readBody(c.req.raw),
      ),
    }),
  );
  routes.put('/workflows/:id/input-values', async (c) => {
    const data = await workflows.updateInputs(
      c.req.param('id'),
      await readInputValues(c.req.raw),
    );
    return c.json({ data });
  });
  routes.patch('/workflows/:id/status', async (c) => {
    const enabled = readEnabled(await readBody(c.req.raw));
    if (enabled === undefined)
      return c.json({ error: 'enabled must be a boolean' }, 400);
    const data = await workflows.setStatus(c.req.param('id'), enabled);
    return c.json({ data });
  });
  routes.post('/workflows/:id/enable', async (c) => {
    const body = await readBody(c.req.raw);
    const deployedHash =
      body !== null &&
      typeof body === 'object' &&
      'deployedHash' in body &&
      typeof Reflect.get(body, 'deployedHash') === 'string'
        ? String(Reflect.get(body, 'deployedHash'))
        : undefined;
    return c.json({
      data: await workflows.enable(c.req.param('id'), deployedHash),
    });
  });
  routes.post('/workflows/:id/disable', async (c) =>
    c.json({ data: await workflows.disable(c.req.param('id')) }),
  );

  return routes;
}
