import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AuthSession } from '@nocobase/app-plugin-authentication';
import type { AuthorizationPlan } from '@nocobase/authorization';

import type { CrmRuntime } from './runtime.js';
import {
  combineCrmFilters,
  filterAstToCrmFilter,
  parseRoleKey,
  type CrmMemberStatus,
  type CrmPermissionRow,
} from './services/access.js';
import {
  CRM_RESOURCES,
  CrmServiceError,
  isCrmApiResource,
  isCrmResource,
  type CrmApiResourceName,
  type CrmRecord,
  type CrmResourceName,
} from './services/crm.js';

type CrmEnv = { Variables: { auth: AuthSession } };

export function createCrmApiRoutes(runtime: CrmRuntime): Hono {
  const api = new Hono();
  api.onError((error, context) => {
    if (error instanceof CrmServiceError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as ContentfulStatusCode,
      );
    }
    console.error(error);
    return context.json(
      { code: 'CRM_INTERNAL_ERROR', message: 'CRM 服务暂时不可用。' },
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
      data: {
        appLang: 'zh-CN',
        enabledLanguages: ['zh-CN', 'en-US'],
      },
    }),
  );

  const protectedApi = new Hono<CrmEnv>();
  protectedApi.use('*', async (context, next) => {
    await runtime.ready();
    const auth = await runtime.getSession(context.req.raw.headers);
    if (!auth) {
      return context.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        401,
      );
    }
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
    return context.json({ data: await createDatabaseOverview(runtime) });
  });
  protectedApi.get('/settings/members', async (context) => {
    await assertSettingsAccess(runtime, context.get('auth'));
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.post('/settings/members', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const input = parseMemberCreate(await readJsonBody(context.req.raw));
    if (await runtime.access.hasUserIdentity(input.email, input.username)) {
      throw new CrmServiceError('邮箱或用户名已存在。', {
        status: 409,
        code: 'CRM_MEMBER_IDENTITY_EXISTS',
      });
    }
    let userId: string | undefined;
    try {
      userId = await runtime.createCredentialUser(input);
      await runtime.access.addMember(userId, input.roleKey, auth.user.id);
    } catch (error) {
      if (userId) await runtime.access.removeProvisionedUser(userId);
      if (error instanceof CrmServiceError) throw error;
      throw new CrmServiceError(
        error instanceof Error ? error.message : '无法创建 CRM 成员。',
        { status: 422, code: 'CRM_MEMBER_CREATE_FAILED' },
      );
    }
    return context.json({ data: await runtime.access.listMembers() });
  });
  protectedApi.post('/settings/members/:userId', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const input = parseMemberUpdate(await readJsonBody(context.req.raw));
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
        parseRoleKey(context.req.param('roleKey')),
      ),
    });
  });
  protectedApi.post('/settings/roles/:roleKey/permissions', async (context) => {
    const auth = context.get('auth')!;
    await assertSettingsAccess(runtime, auth);
    const permissions = parsePermissionRows(
      await readJsonBody(context.req.raw),
    );
    return context.json({
      data: await runtime.access.updateRolePermissions(
        parseRoleKey(context.req.param('roleKey')),
        permissions,
        auth.user.id,
      ),
    });
  });
  protectedApi.get('/:action', async (context) => {
    const parsed = parseResourceAction(context.req.param('action'));
    if (!parsed)
      return context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    const { resource, action } = parsed;
    if (action === 'list')
      return handleList(
        context.req.raw,
        runtime,
        resource,
        context.get('auth')!,
      );
    if (action === 'get')
      return handleGet(
        context.req.raw,
        runtime,
        resource,
        context.get('auth')!,
      );
    return context.json(
      { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      405,
    );
  });
  protectedApi.post('/:action', async (context) => {
    const parsed = parseResourceAction(context.req.param('action'));
    if (!parsed)
      return context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    const { resource, action } = parsed;
    if (action === 'query' && isCrmResource(resource)) {
      const body = await readJsonBody(context.req.raw);
      const plan = await requireAllowed(
        runtime,
        context.get('auth')!,
        resource,
        action,
      );
      return context.json({
        data: await runtime.service.query(resource, {
          ...body,
          filter: combineCrmFilters(
            body.filter,
            filterAstToCrmFilter(plan.filter),
          ),
        }),
      });
    }
    if (!isCrmResource(resource)) {
      return context.json(
        { code: 'CRM_RESOURCE_READ_ONLY', message: 'Resource is read-only' },
        405,
      );
    }
    if (action === 'create') {
      const auth = context.get('auth')!;
      await requireAllowed(runtime, auth, resource, action);
      const body = await constrainScopedWrite(
        runtime,
        auth,
        resource,
        await readJsonBody(context.req.raw),
      );
      return context.json({
        data: await runtime.service.create(resource, body, auth),
      });
    }
    const id = requireFilterByTk(context.req.raw);
    const auth = context.get('auth')!;
    const current = await runtime.service.get(resource, id);
    if (!current) {
      throw new CrmServiceError('Record not found', {
        status: 404,
        code: 'CRM_RECORD_NOT_FOUND',
      });
    }
    await requireAllowed(runtime, auth, resource, action, current);
    if (action === 'update') {
      const body = await constrainScopedWrite(
        runtime,
        auth,
        resource,
        await readJsonBody(context.req.raw),
      );
      return context.json({
        data: await runtime.service.update(resource, id, body, auth),
      });
    }
    if (action === 'destroy') {
      return context.json({
        data: await runtime.service.destroy(resource, id),
      });
    }
    return context.json(
      { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      405,
    );
  });

  api.route('/', protectedApi);
  return api;
}

interface DatabaseCollectionOverview {
  name: CrmResourceName;
  count: number;
  preview: DatabaseRecordPreview[];
}

interface DatabaseRecordPreview {
  id: string | number;
  label: string;
  secondary: string | null;
}

interface DatabaseOverview {
  collections: DatabaseCollectionOverview[];
  totalRecords: number;
}

async function createDatabaseOverview(
  runtime: CrmRuntime,
): Promise<DatabaseOverview> {
  const collections = await Promise.all(
    CRM_RESOURCES.map(async (name) => {
      const result = await runtime.service.list(name, {
        page: 1,
        pageSize: 3,
      });
      return {
        name,
        count: result.count,
        preview: result.rows.map((record) => createRecordPreview(name, record)),
      };
    }),
  );
  return {
    collections,
    totalRecords: collections.reduce(
      (total, collection) => total + collection.count,
      0,
    ),
  };
}

const previewFields: Record<
  CrmResourceName,
  { label: string; secondary: string }
> = {
  agent_crm_accounts: { label: 'name', secondary: 'industry' },
  agent_crm_contacts: { label: 'name', secondary: 'jobTitle' },
  agent_crm_leads: { label: 'name', secondary: 'company' },
  agent_crm_opportunities: { label: 'name', secondary: 'stage' },
  agent_crm_activities: { label: 'subject', secondary: 'status' },
};

function createRecordPreview(
  resource: CrmResourceName,
  record: CrmRecord,
): DatabaseRecordPreview {
  const fields = previewFields[resource];
  return {
    id: record.id,
    label: stringValue(record[fields.label], '未命名记录'),
    secondary: stringValue(record[fields.secondary], null),
  };
}

function stringValue(value: unknown, fallback: string): string;
function stringValue(value: unknown, fallback: null): string | null;
function stringValue(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function createAuthRoutes(runtime: CrmRuntime): Hono {
  const routes = new Hono();
  routes.on(['GET', 'POST'], '/*', (context) =>
    runtime.handleAuth(context.req.raw),
  );
  return routes;
}

async function handleList(
  request: Request,
  runtime: CrmRuntime,
  resource: CrmApiResourceName,
  auth: NonNullable<AuthSession>,
): Promise<Response> {
  const url = new URL(request.url);
  const plan = await requireAllowed(runtime, auth, resource, 'list');
  const result = await runtime.service.list(resource, {
    page: numberParam(url, 'page'),
    pageSize: numberParam(url, 'pageSize'),
    filter: combineCrmFilters(
      jsonParam(url, 'filter'),
      filterAstToCrmFilter(plan.filter),
    ),
    sort: url.searchParams.get('sort') ?? undefined,
    appends: url.searchParams.getAll('appends[]'),
  });
  return Response.json({ data: result.rows, meta: { count: result.count } });
}

async function handleGet(
  request: Request,
  runtime: CrmRuntime,
  resource: CrmApiResourceName,
  auth: NonNullable<AuthSession>,
): Promise<Response> {
  const url = new URL(request.url);
  const id = requireFilterByTk(request);
  const record = await runtime.service.get(
    resource,
    id,
    url.searchParams.getAll('appends[]'),
  );
  if (!record) {
    return Response.json(
      { code: 'CRM_RECORD_NOT_FOUND', message: 'Record not found' },
      { status: 404 },
    );
  }
  await requireAllowed(runtime, auth, resource, 'get', record);
  return Response.json({ data: record });
}

function parseResourceAction(
  value: string,
): { resource: CrmApiResourceName; action: string } | undefined {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const resource = value.slice(0, separator);
  if (!isCrmApiResource(resource)) return undefined;
  return { resource, action: value.slice(separator + 1) };
}

function requireFilterByTk(request: Request): string {
  const id = new URL(request.url).searchParams.get('filterByTk');
  if (!id) {
    throw new CrmServiceError('filterByTk is required.', {
      status: 400,
      code: 'CRM_ID_REQUIRED',
    });
  }
  return id;
}

async function assertSettingsAccess(
  runtime: CrmRuntime,
  auth: AuthSession,
): Promise<void> {
  if (!auth) {
    throw new CrmServiceError('Authentication required', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  await runtime.access.assertCanConfigure(auth.user.id);
}

async function requireAllowed(
  runtime: CrmRuntime,
  auth: NonNullable<AuthSession>,
  resource: CrmApiResourceName,
  action: string,
  record?: Readonly<Record<string, unknown>>,
): Promise<AuthorizationPlan> {
  const plan = await runtime.access.plan(
    auth.user.id,
    resource,
    action,
    record,
  );
  if (!plan.allowed) {
    throw new CrmServiceError('当前角色没有执行此操作的权限。', {
      status: 403,
      code: 'CRM_PERMISSION_DENIED',
    });
  }
  return plan;
}

async function constrainScopedWrite(
  runtime: CrmRuntime,
  auth: NonNullable<AuthSession>,
  resource: CrmResourceName,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (await runtime.access.usesOwnScope(auth.user.id, resource)) {
    return { ...body, ownerId: auth.user.id };
  }
  return body;
}

function parseMemberCreate(body: Record<string, unknown>): {
  name: string;
  username: string;
  email: string;
  password: string;
  roleKey: ReturnType<typeof parseRoleKey>;
} {
  const name = requireText(body.name, '姓名');
  const username = requireText(body.username, '用户名').toLowerCase();
  const email = requireText(body.email, '邮箱').toLowerCase();
  const password = requireText(body.password, '初始密码');
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    throw new CrmServiceError('用户名需为 3-30 位字母、数字、下划线或点。', {
      status: 422,
      code: 'CRM_MEMBER_USERNAME_INVALID',
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CrmServiceError('请输入有效邮箱。', {
      status: 422,
      code: 'CRM_MEMBER_EMAIL_INVALID',
    });
  }
  if (password.length < 8) {
    throw new CrmServiceError('初始密码至少 8 位。', {
      status: 422,
      code: 'CRM_MEMBER_PASSWORD_INVALID',
    });
  }
  return {
    name,
    username,
    email,
    password,
    roleKey: parseRoleKey(body.roleKey),
  };
}

function parseMemberUpdate(body: Record<string, unknown>): {
  status: CrmMemberStatus;
  roleKey: ReturnType<typeof parseRoleKey>;
} {
  if (body.status !== 'active' && body.status !== 'disabled') {
    throw new CrmServiceError('成员状态无效。', {
      status: 400,
      code: 'CRM_MEMBER_STATUS_INVALID',
    });
  }
  return { status: body.status, roleKey: parseRoleKey(body.roleKey) };
}

function parsePermissionRows(
  body: Record<string, unknown>,
): CrmPermissionRow[] {
  if (!Array.isArray(body.permissions)) {
    throw new CrmServiceError('permissions 必须为数组。', {
      status: 400,
      code: 'CRM_PERMISSION_CONFIG_INVALID',
    });
  }
  return body.permissions.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new CrmServiceError('权限配置项无效。', {
        status: 400,
        code: 'CRM_PERMISSION_CONFIG_INVALID',
      });
    }
    return value as CrmPermissionRow;
  });
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CrmServiceError(`${label}不能为空。`, {
      status: 422,
      code: 'CRM_MEMBER_FIELD_REQUIRED',
    });
  }
  return value.trim();
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // The normalized error below is stable for malformed and non-object JSON.
  }
  throw new CrmServiceError('Request body must be a JSON object.', {
    status: 400,
    code: 'CRM_BODY_INVALID',
  });
}

function jsonParam(url: URL, name: string): unknown {
  const value = url.searchParams.get(name);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new CrmServiceError(`${name} must be valid JSON.`, {
      status: 400,
      code: 'CRM_QUERY_INVALID',
    });
  }
}

function numberParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  return value ? Number(value) : undefined;
}

function isWriteMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'same-origin' || fetchSite === 'same-site') return;
  const origin = request.headers.get('origin');
  if (origin && origin === resolveOrigin(request)) return;
  throw new CrmServiceError('CRM 写操作只能来自当前应用页面。', {
    status: 403,
    code: 'CRM_CSRF_INVALID',
  });
}

function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const protocol =
    request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1);
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    url.host;
  return `${protocol}://${host}`;
}
