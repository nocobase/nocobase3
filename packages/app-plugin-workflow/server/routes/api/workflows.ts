import { Hono } from 'hono';

import type { WorkflowService } from '../../services/workflow.js';
import { AppServiceError } from '../../services/errors.js';
import type { MiddlewareHandler } from 'hono';
import type { AppPluginRoutesContext } from '@nocobase/app-server/plugins';

export interface WorkflowPluginRouteDeps {
  auth: { required(): MiddlewareHandler };
}

export interface WorkflowPluginRouteServices {
  plugins: Record<string, unknown>;
}

export type WorkflowPluginRoutesContext = AppPluginRoutesContext<
  WorkflowPluginRouteDeps,
  WorkflowPluginRouteServices
>;

export type WorkflowPermission =
  | 'workflow:list'
  | 'workflow:view'
  | 'workflow:updateStatus'
  | 'workflow:updateInputs'
  | 'workflow:run'
  | 'workflowRun:list'
  | 'workflowRun:view'
  | 'workflowRun:viewPayload'
  | 'workflowRun:viewLog';
export interface WorkflowAuditEvent {
  action: 'workflow.status' | 'workflow.inputValues' | 'workflow.run';
  workflowId: string;
  occurredAt: string;
  details: Record<string, string | number | boolean | null>;
}
export interface WorkflowRouteOptions {
  workflow: WorkflowService;
  authorize?: (
    request: Request,
    permission: WorkflowPermission,
  ) => boolean | Promise<boolean>;
  audit?: (request: Request, event: WorkflowAuditEvent) => void | Promise<void>;
}

export function createWorkflowRoutes(options: WorkflowRouteOptions): Hono {
  const routes = new Hono();
  const allowed = async (
    request: Request,
    permission: WorkflowPermission,
  ): Promise<Response | null> =>
    options.authorize && !(await options.authorize(request, permission))
      ? Response.json({ error: 'Forbidden' }, { status: 403 })
      : null;
  routes.get('/workflows', async (c) => {
    const denied = await allowed(c.req.raw, 'workflow:list');
    if (denied) return denied;
    const enabled = parseBoolean(c.req.query('enabled'));
    const page = await options.workflow.list({
      query: c.req.query('q'),
      ...(enabled === undefined ? {} : { enabled }),
      ...readPage(c.req.query('page'), c.req.query('pageSize')),
    });
    return c.json(toPageResponse(page));
  });
  routes.get(
    '/workflows/:id',
    async (c) =>
      (await allowed(c.req.raw, 'workflow:view')) ??
      c.json({ data: await options.workflow.getWorkflow(c.req.param('id')) }),
  );
  routes.get(
    '/workflows/:id/revisions',
    async (c) =>
      (await allowed(c.req.raw, 'workflow:view')) ??
      c.json({ data: await options.workflow.revisions(c.req.param('id')) }),
  );
  routes.get('/workflow-runs', async (c) => {
    const denied = await allowed(c.req.raw, 'workflowRun:list');
    if (denied) return denied;
    const status = parseStatus(c.req.query('status'));
    const page = await options.workflow.runs({
      workflowKey: c.req.query('workflowKey'),
      workflowTitle: c.req.query('workflowTitle'),
      ...(status === undefined ? {} : { status }),
      ...readPage(c.req.query('page'), c.req.query('pageSize')),
    });
    return c.json(toPageResponse(page));
  });
  routes.get(
    '/workflow-runs/:id',
    async (c) =>
      (await allowed(c.req.raw, 'workflowRun:view')) ??
      c.json({ data: await options.workflow.getRun(c.req.param('id')) }),
  );
  routes.get(
    '/workflow-runs/:id/node-runs',
    async (c) =>
      (await allowed(c.req.raw, 'workflowRun:view')) ??
      c.json({
        data: await options.workflow.nodeRuns(
          c.req.param('id'),
          c.req.query('nodeKey'),
        ),
      }),
  );
  routes.get(
    '/workflow-runs/:runId/node-runs/:nodeRunId/payload',
    async (c) => {
      const denied = await allowed(c.req.raw, 'workflowRun:viewPayload');
      if (denied) return denied;
      const payload = await options.workflow.nodeRunPayload(
        c.req.param('runId'),
        c.req.param('nodeRunId'),
      );
      const canViewLog =
        !options.authorize ||
        (await options.authorize(c.req.raw, 'workflowRun:viewLog'));
      return c.json({ data: canViewLog ? payload : { ...payload, log: null } });
    },
  );
  routes.get(
    '/workflows/:id/runs',
    async (c) =>
      (await allowed(c.req.raw, 'workflowRun:list')) ??
      c.json({
        data: await options.workflow.runsForWorkflow(c.req.param('id')),
      }),
  );
  routes.get(
    '/workflows/:id/inputs',
    async (c) =>
      (await allowed(c.req.raw, 'workflow:view')) ??
      c.json({ data: await options.workflow.getInputs(c.req.param('id')) }),
  );
  routes.put(
    '/workflows/:id/inputs',
    async (c) =>
      (await allowed(c.req.raw, 'workflow:updateInputs')) ??
      c.json({
        data: await options.workflow.updateInputs(
          c.req.param('id'),
          await readBody(c.req.raw),
        ),
      }),
  );
  routes.put('/workflows/:id/input-values', async (c) => {
    const denied = await allowed(c.req.raw, 'workflow:updateInputs');
    if (denied) return denied;
    const data = await options.workflow.updateInputs(
      c.req.param('id'),
      await readInputValues(c.req.raw),
    );
    await options.audit?.(
      c.req.raw,
      auditEvent('workflow.inputValues', c.req.param('id'), {
        overrideCount: Object.keys(data.values).length,
      }),
    );
    return c.json({ data });
  });
  routes.patch('/workflows/:id/status', async (c) => {
    const denied = await allowed(c.req.raw, 'workflow:updateStatus');
    if (denied) return denied;
    const enabled = readEnabled(await readBody(c.req.raw));
    if (enabled === undefined)
      return c.json({ error: 'enabled must be a boolean' }, 400);
    const data = await options.workflow.setStatus(c.req.param('id'), enabled);
    await options.audit?.(
      c.req.raw,
      auditEvent('workflow.status', c.req.param('id'), { enabled }),
    );
    return c.json({ data });
  });
  routes.post('/workflows/:id/enable', async (c) => {
    const denied = await allowed(c.req.raw, 'workflow:updateStatus');
    if (denied) return denied;
    const body = await readBody(c.req.raw);
    const deployedHash =
      body !== null &&
      typeof body === 'object' &&
      'deployedHash' in body &&
      typeof Reflect.get(body, 'deployedHash') === 'string'
        ? String(Reflect.get(body, 'deployedHash'))
        : undefined;
    return c.json({
      data: await options.workflow.enable(c.req.param('id'), deployedHash),
    });
  });
  routes.post(
    '/workflows/:id/disable',
    async (c) =>
      (await allowed(c.req.raw, 'workflow:updateStatus')) ??
      c.json({ data: await options.workflow.disable(c.req.param('id')) }),
  );
  routes.post('/workflows/:id/run', async (c) => {
    const denied = await allowed(c.req.raw, 'workflow:run');
    if (denied) return denied;
    const data = await options.workflow.run(
      c.req.param('id'),
      await readContext(c.req.raw),
      c.req.header('idempotency-key'),
    );
    await options.audit?.(
      c.req.raw,
      auditEvent('workflow.run', c.req.param('id'), {
        runId: String(data.id),
        eventKey: data.eventKey,
      }),
    );
    return c.json({ data });
  });
  return routes;
}

export default function registerWorkflowRoutes({
  app,
  deps,
  services,
}: WorkflowPluginRoutesContext): void {
  const workflow = services.plugins.workflow;
  if (!isWorkflowService(workflow)) {
    throw new Error('Workflow plugin service was not registered by bootstrap.');
  }
  const protectedRoutes = new Hono();
  protectedRoutes.onError((error, context) => {
    if (error instanceof AppServiceError) {
      return context.json({ error: error.message }, error.status);
    }
    return context.json({ error: 'Internal server error.' }, 500);
  });
  protectedRoutes.use('*', deps.auth.required());
  protectedRoutes.route('/', createWorkflowRoutes({ workflow }));
  app.route('/api', protectedRoutes);
}

function isWorkflowService(value: unknown): value is WorkflowService {
  return typeof value === 'object' && value !== null && 'list' in value;
}

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? request.json() : {};
}
function readEnabled(body: unknown): boolean | undefined {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.hasOwn(body, 'enabled')
  )
    return undefined;
  const enabled: unknown = Reflect.get(body, 'enabled');
  return typeof enabled === 'boolean' ? enabled : undefined;
}
async function readInputValues(request: Request): Promise<unknown> {
  const body = await readBody(request);
  return body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'inputValues')
    ? Reflect.get(body, 'inputValues')
    : body;
}
async function readContext(request: Request): Promise<unknown> {
  const body = await readBody(request);
  return body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'context')
    ? Reflect.get(body, 'context')
    : body;
}
function readPage(
  pageValue?: string,
  pageSizeValue?: string,
): { page: number; pageSize: number } {
  const page = Math.max(1, Number(pageValue ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(pageSizeValue ?? 20) || 20),
  );
  return { page, pageSize };
}
function toPageResponse<T>(page: {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}): { data: T[]; meta: { page: number; pageSize: number; total: number } } {
  return {
    data: page.data,
    meta: { page: page.page, pageSize: page.pageSize, total: page.total },
  };
}
function parseBoolean(value?: string): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}
function parseStatus(value?: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'null') return null;
  const status = Number(value);
  return Number.isFinite(status) ? status : undefined;
}
function auditEvent(
  action: WorkflowAuditEvent['action'],
  workflowId: string,
  details: WorkflowAuditEvent['details'],
): WorkflowAuditEvent {
  return { action, workflowId, occurredAt: new Date().toISOString(), details };
}
