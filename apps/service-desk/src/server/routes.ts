import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AuthSession } from '@nocobase/app-plugin-authentication';
import {
  AppAccessControlError,
  parseAppAccessMemberCreate,
  parseAppAccessMemberUpdate,
  parseAppAccessPermissionRows,
  readAppAccessJsonBody,
} from '@nocobase/app-plugin-access-control/server';

import { serviceDeskAccessControlDefinition } from './access-control.js';
import type { ServiceDeskRuntime } from './runtime.js';
import {
  ServiceDeskStoreError,
  type Customer,
  type TicketDraft,
  type TicketPriority,
  type TicketStatus,
} from './store.js';

type ServiceDeskEnv = { Variables: { auth: AuthSession } };

export function createServiceDeskApiRoutes(runtime: ServiceDeskRuntime): Hono {
  const api = new Hono();
  api.onError((error, context) => {
    if (error instanceof AppAccessControlError) {
      return context.json(
        { error: error.message, message: error.message, code: error.code },
        error.status as ContentfulStatusCode,
      );
    }
    if (error instanceof ServiceDeskStoreError) {
      return context.json(
        { error: error.message, message: error.message, code: error.code },
        error.status as ContentfulStatusCode,
      );
    }
    console.error(error);
    return context.json(
      {
        error: '客户服务暂时不可用',
        message: '客户服务暂时不可用',
        code: 'SERVICE_DESK_INTERNAL_ERROR',
      },
      500,
    );
  });

  api.route('/auth', createAuthRoutes(runtime));
  api.get('/healthz', async (context) => {
    await runtime.ready();
    return context.json({ ok: true, database: 'ready' });
  });
  api.get('/systemSettings:get', (context) =>
    context.json({
      data: { appLang: 'zh-CN', enabledLanguages: ['zh-CN', 'en-US'] },
    }),
  );

  const protectedApi = new Hono<ServiceDeskEnv>();
  protectedApi.use('*', async (context, next) => {
    const auth = await runtime.getSession(context.req.raw.headers);
    if (!auth)
      return context.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        401,
      );
    context.set('auth', auth);
    if (isWriteMethod(context.req.method)) assertSameOrigin(context.req.raw);
    await next();
  });
  protectedApi.get('/roles:check', async (context) =>
    context.json({
      data: await runtime.access.permissionsFor(context.get('auth')!.user.id),
    }),
  );
  protectedApi.get('/runtime:resources', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    return context.json({ data: [await runtime.databaseStatus()] });
  });
  protectedApi.get('/runtime:database-overview', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    const state = await runtime.store.snapshot();
    const activities = state.tickets.flatMap((ticket) =>
      ticket.activities.map((activity) => ({
        ...activity,
        ticketId: ticket.id,
      })),
    );
    const collections = [
      overview('app_service_desk_customers', state.customers, (item) => [
        item.company,
        item.contactName,
      ]),
      overview('app_service_desk_services', state.services, (item) => [
        item.name,
        item.ownerTeam,
      ]),
      overview('app_service_desk_agents', state.agents, (item) => [
        item.name,
        item.team,
      ]),
      overview('app_service_desk_tickets', state.tickets, (item) => [
        item.ticketNo,
        item.title,
      ]),
      overview('app_service_desk_activities', activities, (item) => [
        item.author,
        item.content,
      ]),
    ];
    return context.json({
      data: {
        collections,
        totalRecords: collections.reduce(
          (total, item) => total + item.count,
          0,
        ),
      },
    });
  });
  protectedApi.get('/bootstrap', async (context) => {
    await Promise.all(
      serviceDeskAccessControlDefinition.resources.map((resource) =>
        requireAllowed(runtime, context.get('auth')!, resource.name, 'list'),
      ),
    );
    const [state, dashboard] = await Promise.all([
      runtime.store.snapshot(),
      runtime.store.dashboard(),
    ]);
    return context.json({ data: { ...state, dashboard } });
  });
  protectedApi.get('/settings/members', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.post('/settings/members', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const input = parseAppAccessMemberCreate(
      await readAppAccessJsonBody(context.req.raw),
      serviceDeskAccessControlDefinition.roles.map((role) => role.key),
    );
    if (await runtime.access.hasUserIdentity(input.email, input.username)) {
      throw new AppAccessControlError('邮箱或用户名已存在。', {
        status: 409,
        code: 'SERVICE_DESK_MEMBER_IDENTITY_EXISTS',
      });
    }
    let userId: string | undefined;
    try {
      userId = await runtime.createCredentialUser(input);
      await runtime.access.addMember(userId, input.roleKey, auth.user.id);
    } catch (error) {
      if (userId) await runtime.access.removeProvisionedUser(userId);
      if (error instanceof AppAccessControlError) throw error;
      throw new AppAccessControlError(
        error instanceof Error ? error.message : '无法创建 App 成员。',
        { status: 422, code: 'SERVICE_DESK_MEMBER_CREATE_FAILED' },
      );
    }
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.post('/settings/members/:userId', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const input = parseAppAccessMemberUpdate(
      await readAppAccessJsonBody(context.req.raw),
      serviceDeskAccessControlDefinition.roles.map((role) => role.key),
    );
    await runtime.access.updateMember(
      context.req.param('userId'),
      input,
      auth.user.id,
    );
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.get('/settings/roles', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    return context.json({ data: await runtime.access.listRoles() });
  });
  protectedApi.get('/settings/roles/:roleKey/permissions', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    return context.json({
      data: await runtime.access.getRolePermissions(
        context.req.param('roleKey'),
      ),
    });
  });
  protectedApi.post('/settings/roles/:roleKey/permissions', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const permissions = parseAppAccessPermissionRows(
      await readAppAccessJsonBody(context.req.raw),
    );
    return context.json({
      data: await runtime.access.updateRolePermissions(
        context.req.param('roleKey'),
        permissions,
        auth.user.id,
      ),
    });
  });
  protectedApi.get('/tickets', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'list');
    return context.json({ data: (await runtime.store.snapshot()).tickets });
  });
  protectedApi.post('/tickets', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'create');
    return context.json(
      {
        data: await runtime.store.createTicket(
          await readTicketDraft(context.req.raw),
        ),
      },
      201,
    );
  });
  protectedApi.post('/tickets/:id/assign', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.assignTicket(
        context.req.param('id'),
        stringValue(body.agentId),
      ),
    });
  });
  protectedApi.post('/tickets/:id/transition', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.transitionTicket(
        context.req.param('id'),
        requireTicketStatus(body.status),
      ),
    });
  });
  protectedApi.post('/tickets/:id/replies', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.addReply(
        context.req.param('id'),
        stringValue(body.content),
      ),
    });
  });
  protectedApi.patch('/tickets/:id', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.updateTicket(context.req.param('id'), {
        title: optionalString(body.title),
        description: optionalString(body.description),
        customerId: optionalString(body.customerId),
        serviceId: optionalString(body.serviceId),
        priority:
          body.priority === undefined
            ? undefined
            : requireTicketPriority(body.priority),
      }),
    });
  });
  protectedApi.delete('/tickets/:id', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'tickets', 'destroy');
    await runtime.store.deleteTicket(context.req.param('id'));
    return context.body(null, 204);
  });
  protectedApi.post('/customers', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'customers', 'create');
    const body = await readRecord(context.req.raw);
    return context.json(
      {
        data: await runtime.store.createCustomer({
          company: stringValue(body.company),
          contactName: stringValue(body.contactName),
          phone: stringValue(body.phone),
          email: stringValue(body.email),
          level: customerLevel(body.level),
        } satisfies Omit<Customer, 'id' | 'createdAt'>),
      },
      201,
    );
  });
  api.route('/', protectedApi);
  return api;
}

function createAuthRoutes(runtime: ServiceDeskRuntime): Hono {
  const routes = new Hono();
  routes.on(['GET', 'POST'], '/*', (context) =>
    runtime.handleAuth(context.req.raw),
  );
  return routes;
}

async function assertSettingsAccess(
  runtime: ServiceDeskRuntime,
  auth: AuthSession,
): Promise<void> {
  if (!auth) {
    throw new AppAccessControlError('Authentication required', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  await runtime.access.assertCanConfigure(auth.user.id);
}

async function requireAllowed(
  runtime: ServiceDeskRuntime,
  auth: NonNullable<AuthSession>,
  resource: string,
  action: string,
): Promise<void> {
  const plan = await runtime.access.plan(auth.user.id, resource, action);
  if (!plan.allowed) {
    throw new AppAccessControlError('当前角色没有执行此操作的权限。', {
      status: 403,
      code: 'SERVICE_DESK_PERMISSION_DENIED',
    });
  }
}

function overview<T extends { id: string }>(
  name: string,
  records: T[],
  label: (record: T) => [string, string],
): {
  name: string;
  count: number;
  preview: Array<{ id: string; label: string; secondary: string }>;
} {
  return {
    name,
    count: records.length,
    preview: records.slice(0, 3).map((record) => {
      const [primary, secondary] = label(record);
      return { id: record.id, label: primary, secondary };
    }),
  };
}

async function readTicketDraft(request: Request): Promise<TicketDraft> {
  const body = await readRecord(request);
  return {
    title: stringValue(body.title),
    description: stringValue(body.description),
    customerId: stringValue(body.customerId),
    serviceId: stringValue(body.serviceId),
    priority: requireTicketPriority(body.priority),
  };
}

async function readRecord(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceDeskStoreError('请求数据必须是对象', {
      status: 400,
      code: 'INVALID_BODY',
    });
  }
  return value as Record<string, unknown>;
}

function requireTicketStatus(value: unknown): TicketStatus {
  if (
    value === 'new' ||
    value === 'assigned' ||
    value === 'in_progress' ||
    value === 'waiting' ||
    value === 'resolved' ||
    value === 'closed'
  )
    return value;
  throw new ServiceDeskStoreError('工单状态无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function requireTicketPriority(value: unknown): TicketPriority {
  if (
    value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'urgent'
  )
    return value;
  throw new ServiceDeskStoreError('优先级无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function customerLevel(value: unknown): Customer['level'] {
  return value === 'key' || value === 'strategic' ? value : 'standard';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : stringValue(value);
}

function isWriteMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function assertSameOrigin(request: Request): void {
  const site = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (site === 'same-origin' || site === 'same-site') return;
  const origin = request.headers.get('origin');
  if (origin && origin === new URL(request.url).origin) return;
  throw new ServiceDeskStoreError('服务台写操作只能来自当前应用页面', {
    status: 403,
    code: 'SERVICE_DESK_CSRF_INVALID',
  });
}
