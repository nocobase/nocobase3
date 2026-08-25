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

import { ordersAccessControlDefinition } from './access-control.js';
import type { OrdersRuntime } from './runtime.js';
import {
  OrdersStoreError,
  type Customer,
  type OrderDraft,
  type OrderStatus,
  type PaymentStatus,
  type Product,
} from './store.js';

type OrdersEnv = { Variables: { auth: AuthSession } };

export function createOrdersApiRoutes(runtime: OrdersRuntime): Hono {
  const api = new Hono();
  api.onError((error, context) => {
    if (error instanceof AppAccessControlError) {
      return context.json(
        { error: error.message, message: error.message, code: error.code },
        error.status as ContentfulStatusCode,
      );
    }
    if (error instanceof OrdersStoreError) {
      return context.json(
        { error: error.message, message: error.message, code: error.code },
        error.status as ContentfulStatusCode,
      );
    }
    console.error(error);
    return context.json(
      {
        error: '订单服务暂时不可用',
        message: '订单服务暂时不可用',
        code: 'ORDERS_INTERNAL_ERROR',
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

  const protectedApi = new Hono<OrdersEnv>();
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
    const collections = [
      overview('app_orders_customers', state.customers, (item) => [
        item.name,
        item.contactName,
      ]),
      overview('app_orders_products', state.products, (item) => [
        item.name,
        item.sku,
      ]),
      overview('app_orders_orders', state.orders, (item) => [
        item.orderNo,
        item.customerName,
      ]),
      overview(
        'app_orders_order_lines',
        state.orders.flatMap((order) =>
          order.lines.map((line, index) => ({
            id: `${order.id}:${index}`,
            ...line,
          })),
        ),
        (item) => [item.productName, `${item.quantity} 件`],
      ),
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
      ordersAccessControlDefinition.resources.map((resource) =>
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
      ordersAccessControlDefinition.roles.map((role) => role.key),
    );
    if (await runtime.access.hasUserIdentity(input.email, input.username)) {
      throw new AppAccessControlError('邮箱或用户名已存在。', {
        status: 409,
        code: 'ORDERS_MEMBER_IDENTITY_EXISTS',
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
        { status: 422, code: 'ORDERS_MEMBER_CREATE_FAILED' },
      );
    }
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.post('/settings/members/:userId', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const input = parseAppAccessMemberUpdate(
      await readAppAccessJsonBody(context.req.raw),
      ordersAccessControlDefinition.roles.map((role) => role.key),
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
  protectedApi.get('/orders', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'orders', 'list');
    return context.json({ data: (await runtime.store.snapshot()).orders });
  });
  protectedApi.post('/orders', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'orders', 'create');
    return context.json(
      {
        data: await runtime.store.createOrder(
          await readOrderDraft(context.req.raw),
        ),
      },
      201,
    );
  });
  protectedApi.post('/orders/:id/transition', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'orders', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.transitionOrder(
        context.req.param('id'),
        requireOrderStatus(body.status),
      ),
    });
  });
  protectedApi.patch('/orders/:id', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'orders', 'update');
    const body = await readRecord(context.req.raw);
    return context.json({
      data: await runtime.store.updateOrder(context.req.param('id'), {
        customerId: optionalString(body.customerId),
        lines: Array.isArray(body.lines)
          ? body.lines.map(normalizeLine)
          : undefined,
        notes: optionalString(body.notes),
        paymentStatus:
          body.paymentStatus === undefined
            ? undefined
            : requirePaymentStatus(body.paymentStatus),
      }),
    });
  });
  protectedApi.delete('/orders/:id', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'orders', 'destroy');
    await runtime.store.deleteOrder(context.req.param('id'));
    return context.body(null, 204);
  });
  protectedApi.get('/customers', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'customers', 'list');
    return context.json({ data: (await runtime.store.snapshot()).customers });
  });
  protectedApi.post('/customers', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'customers', 'create');
    const body = await readRecord(context.req.raw);
    return context.json(
      {
        data: await runtime.store.createCustomer({
          name: stringValue(body.name),
          contactName: stringValue(body.contactName),
          phone: stringValue(body.phone),
          email: stringValue(body.email),
          level: customerLevel(body.level),
        } satisfies Omit<Customer, 'id' | 'createdAt'>),
      },
      201,
    );
  });
  protectedApi.get('/products', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'products', 'list');
    return context.json({ data: (await runtime.store.snapshot()).products });
  });
  protectedApi.post('/products', async (context) => {
    await requireAllowed(runtime, context.get('auth')!, 'products', 'create');
    const body = await readRecord(context.req.raw);
    return context.json(
      {
        data: await runtime.store.createProduct({
          sku: stringValue(body.sku),
          name: stringValue(body.name),
          category: stringValue(body.category),
          price: Number(body.price),
          stock: Number(body.stock),
          status: body.status === 'inactive' ? 'inactive' : 'active',
        } satisfies Omit<Product, 'id' | 'createdAt'>),
      },
      201,
    );
  });

  api.route('/', protectedApi);
  return api;
}

function createAuthRoutes(runtime: OrdersRuntime): Hono {
  const routes = new Hono();
  routes.on(['GET', 'POST'], '/*', (context) =>
    runtime.handleAuth(context.req.raw),
  );
  return routes;
}

async function assertSettingsAccess(
  runtime: OrdersRuntime,
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
  runtime: OrdersRuntime,
  auth: NonNullable<AuthSession>,
  resource: string,
  action: string,
): Promise<void> {
  const plan = await runtime.access.plan(auth.user.id, resource, action);
  if (!plan.allowed) {
    throw new AppAccessControlError('当前角色没有执行此操作的权限。', {
      status: 403,
      code: 'ORDERS_PERMISSION_DENIED',
    });
  }
}

function overview<T extends { id: string }>(
  name: string,
  records: T[],
  label: (record: T) => [string, string],
) {
  return {
    name,
    count: records.length,
    preview: records.slice(0, 3).map((record) => {
      const [primary, secondary] = label(record);
      return { id: record.id, label: primary, secondary };
    }),
  };
}

async function readOrderDraft(request: Request): Promise<OrderDraft> {
  const body = await readRecord(request);
  return {
    customerId: stringValue(body.customerId),
    lines: Array.isArray(body.lines) ? body.lines.map(normalizeLine) : [],
    notes: stringValue(body.notes),
  };
}

function normalizeLine(value: unknown): {
  productId: string;
  quantity: number;
} {
  const line =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    productId: stringValue(line.productId),
    quantity: Number(line.quantity),
  };
}

async function readRecord(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new OrdersStoreError('请求数据必须是对象', {
      status: 400,
      code: 'INVALID_BODY',
    });
  return value as Record<string, unknown>;
}

function requireOrderStatus(value: unknown): OrderStatus {
  if (
    value === 'draft' ||
    value === 'pending' ||
    value === 'processing' ||
    value === 'shipped' ||
    value === 'completed' ||
    value === 'cancelled'
  )
    return value;
  throw new OrdersStoreError('订单状态无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function requirePaymentStatus(value: unknown): PaymentStatus {
  if (
    value === 'unpaid' ||
    value === 'partial' ||
    value === 'paid' ||
    value === 'refunded'
  )
    return value;
  throw new OrdersStoreError('付款状态无效', {
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
  throw new OrdersStoreError('订单写操作只能来自当前应用页面', {
    status: 403,
    code: 'ORDERS_CSRF_INVALID',
  });
}
