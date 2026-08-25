// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Hono } from 'hono';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createApp,
  createCrmRuntime,
  type CrmRuntime,
} from '../../server/index.ts';
import {
  CRM_RESOURCES,
  type CrmResourceName,
} from '../../server/services/crm.ts';

const origin = 'http://localhost';
const appBasePath = '/crm';
const apiBasePath = `${appBasePath}/api`;
const migrationsDirectory = path.join(process.cwd(), 'server/migrations');
const seedPath = path.join(process.cwd(), 'nocobase/seed/demo-data.json');

type JsonRecord = Record<string, unknown>;

describe('native CRM app server', () => {
  let root: string;
  let runtime: CrmRuntime;
  let app: Hono;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'nocobase3-crm-'));
    runtime = createTestRuntime(root);
    app = createTestApp(runtime);
    await runtime.ready();
  });

  afterEach(async () => {
    await runtime.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('runs migrations and demo seed idempotently across restarts', async () => {
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as Record<
      string,
      unknown[]
    >;
    const knex = await runtime.database.connection().client<Knex>();

    for (const resource of CRM_RESOURCES) {
      await expect(knex.schema.hasTable(resource)).resolves.toBe(true);
    }

    const before = await snapshotResources(runtime);
    expect(before.agent_crm_accounts.count).toBe(seed.accounts.length);
    expect(before.agent_crm_contacts.count).toBe(seed.contacts.length);
    expect(before.agent_crm_leads.count).toBe(seed.leads.length);
    expect(before.agent_crm_opportunities.count).toBe(
      seed.opportunities.length,
    );
    expect(before.agent_crm_activities.count).toBe(seed.activities.length);

    await runtime.close();
    runtime = createTestRuntime(root);
    app = createTestApp(runtime);
    await runtime.ready();

    expect(await snapshotResources(runtime)).toEqual(before);
  });

  it('upgrades the legacy preview administrator without replacing its identity', async () => {
    const created = await signUp(app, {
      name: 'admin',
      username: 'admin',
      email: 'admin@nocobase.com',
      password: 'admin123',
    });
    expect(created.status).toBe(200);
    const knex = await runtime.database.connection().client<Knex>();
    const legacy = (await knex('user')
      .select(['id', 'updatedAt'])
      .where('username', 'admin')
      .first()) as { id: string; updatedAt: unknown };

    await runtime.close();
    runtime = createTestRuntime(root);
    app = createTestApp(runtime);
    await runtime.ready();

    const upgraded = (await (
      await runtime.database.connection().client<Knex>()
    )('user')
      .select(['id', 'name', 'username', 'email', 'updatedAt'])
      .where('id', legacy.id)
      .first()) as Record<string, unknown>;
    expect(upgraded).toMatchObject({
      id: legacy.id,
      name: 'nocobase',
      username: 'nocobase',
      email: 'admin@nocobase.com',
    });
    expect(upgraded.updatedAt).not.toEqual(legacy.updatedAt);
    await signIn(app, 'nocobase', 'admin123');

    await runtime.close();
    runtime = createTestRuntime(root);
    app = createTestApp(runtime);
    await runtime.ready();
    const afterSecondRun = (await (
      await runtime.database.connection().client<Knex>()
    )('user')
      .select(['id', 'updatedAt'])
      .where('id', legacy.id)
      .first()) as Record<string, unknown>;
    expect(afterSecondRun).toEqual({
      id: legacy.id,
      updatedAt: upgraded.updatedAt,
    });
  });

  it('does not rename an unrelated administrator account', async () => {
    const created = await signUp(app, {
      name: 'admin',
      username: 'admin',
      email: 'owner@example.com',
      password: 'owner12345',
    });
    expect(created.status).toBe(200);

    await runtime.close();
    runtime = createTestRuntime(root);
    app = createTestApp(runtime);
    await runtime.ready();

    const knex = await runtime.database.connection().client<Knex>();
    await expect(
      knex('user')
        .select(['name', 'username', 'email'])
        .where('email', 'owner@example.com')
        .first(),
    ).resolves.toEqual({
      name: 'admin',
      username: 'admin',
      email: 'owner@example.com',
    });
    await signIn(app, 'admin', 'owner12345');
  });

  it('requires login and closes public registration after the first account', async () => {
    const anonymous = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:list`,
    );
    expect(anonymous.status).toBe(401);

    const signedUp = await signUp(app, {
      name: 'CRM Admin',
      username: 'nocobase',
      email: 'admin@example.com',
      password: 'admin12345',
    });
    expect(signedUp.status).toBe(200);

    const secondSignUp = await signUp(app, {
      name: 'Second Admin',
      username: 'second-admin',
      email: 'second@example.com',
      password: 'admin12345',
    });
    expect(secondSignUp.status).toBe(403);
    await expect(secondSignUp.json()).resolves.toMatchObject({
      code: 'CRM_SIGN_UP_CLOSED',
    });

    const cookie = await signIn(app, 'nocobase', 'admin12345');
    const authenticated = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:list`,
      { headers: { cookie } },
    );
    expect(authenticated.status).toBe(200);
  });

  it('enforces App roles, ownership scopes, membership state, and settings invariants', async () => {
    await createAdmin(app);
    const adminCookie = await signIn(app, 'nocobase', 'admin12345');

    const initialAcl = await app.request(
      `${origin}${apiBasePath}/roles:check`,
      { headers: { cookie: adminCookie } },
    );
    expect(initialAcl.status).toBe(200);
    await expect(initialAcl.json()).resolves.toMatchObject({
      data: {
        role: 'crm-admin',
        allowConfigure: true,
        actions: { 'agent_crm_accounts:destroy': {} },
      },
    });

    const membersAfterSales = await createMember(app, adminCookie, {
      name: 'CRM Sales',
      username: 'sales',
      email: 'sales@example.com',
      password: 'sales12345',
      roleKey: 'crm-sales',
    });
    const salesId = memberId(membersAfterSales, 'sales');
    const membersAfterManager = await createMember(app, adminCookie, {
      name: 'CRM Sales Manager',
      username: 'sales_manager',
      email: 'sales-manager@example.com',
      password: 'manager12345',
      roleKey: 'crm-sales-manager',
    });
    const managerId = memberId(membersAfterManager, 'sales_manager');

    const salesCookie = await signIn(app, 'sales', 'sales12345');
    const managerCookie = await signIn(app, 'sales_manager', 'manager12345');
    const salesAcl = await app.request(`${origin}${apiBasePath}/roles:check`, {
      headers: { cookie: salesCookie },
    });
    await expect(salesAcl.json()).resolves.toMatchObject({
      data: {
        role: 'crm-sales',
        allowConfigure: false,
        actions: {
          'agent_crm_accounts:list': {},
          'agent_crm_leads:create': {},
        },
      },
    });

    const salesLeadsBefore = await app.request(
      `${origin}${apiBasePath}/agent_crm_leads:list?page=1&pageSize=100`,
      { headers: { cookie: salesCookie } },
    );
    expect(salesLeadsBefore.status).toBe(200);
    await expect(salesLeadsBefore.json()).resolves.toMatchObject({
      data: [],
      meta: { count: 0 },
    });

    const salesLead = await postAction(
      app,
      salesCookie,
      'agent_crm_leads',
      'create',
      {
        name: '销售人员线索',
        company: '本人客户公司',
        status: 'new',
        source: 'inbound',
      },
    );
    expect(salesLead.ownerId).toBe(salesId);
    const managerLead = await postAction(
      app,
      managerCookie,
      'agent_crm_leads',
      'create',
      {
        name: '经理线索',
        company: '经理客户公司',
        status: 'new',
        source: 'referral',
      },
    );
    expect(managerLead.ownerId).toBe(managerId);

    const salesLeadsAfter = await app.request(
      `${origin}${apiBasePath}/agent_crm_leads:list?page=1&pageSize=100`,
      { headers: { cookie: salesCookie } },
    );
    expect(salesLeadsAfter.status).toBe(200);
    await expect(salesLeadsAfter.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ id: salesLead.id })],
      meta: { count: 1 },
    });

    const otherLead = await app.request(
      `${origin}${apiBasePath}/agent_crm_leads:get?filterByTk=${managerLead.id}`,
      { headers: { cookie: salesCookie } },
    );
    expect(otherLead.status).toBe(403);
    await expect(otherLead.json()).resolves.toMatchObject({
      code: 'CRM_PERMISSION_DENIED',
    });

    const managerCanRead = await app.request(
      `${origin}${apiBasePath}/agent_crm_leads:get?filterByTk=${salesLead.id}`,
      { headers: { cookie: managerCookie } },
    );
    expect(managerCanRead.status).toBe(200);

    const salesOverview = await app.request(
      `${origin}${apiBasePath}/runtime:database-overview`,
      { headers: { cookie: salesCookie } },
    );
    expect(salesOverview.status).toBe(403);
    const settingsMembers = await app.request(
      `${origin}${apiBasePath}/settings/members`,
      { headers: { cookie: salesCookie } },
    );
    expect(settingsMembers.status).toBe(403);

    const currentPermissions = await app.request(
      `${origin}${apiBasePath}/settings/roles/crm-sales/permissions`,
      { headers: { cookie: adminCookie } },
    );
    expect(currentPermissions.status).toBe(200);
    const permissionsPayload = (await currentPermissions.json()) as {
      data: { permissions: Array<Record<string, unknown>> };
    };
    const noAccountRead = permissionsPayload.data.permissions.map(
      (permission) =>
        permission.resource === 'agent_crm_accounts'
          ? { ...permission, capabilities: [] }
          : permission,
    );
    const savedPermissions = await app.request(
      `${origin}${apiBasePath}/settings/roles/crm-sales/permissions`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({ permissions: noAccountRead }),
      },
    );
    expect(savedPermissions.status).toBe(200);
    const knex = await runtime.database.connection().client<Knex>();
    const auditCountAfterSave = await permissionAuditCount(knex);
    const repeatedSave = await app.request(
      `${origin}${apiBasePath}/settings/roles/crm-sales/permissions`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({ permissions: noAccountRead }),
      },
    );
    expect(repeatedSave.status).toBe(200);
    expect(await permissionAuditCount(knex)).toBe(auditCountAfterSave);
    const deniedAccounts = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:list`,
      { headers: { cookie: salesCookie } },
    );
    expect(deniedAccounts.status).toBe(403);

    const restorePermissions = await app.request(
      `${origin}${apiBasePath}/settings/roles/crm-sales/permissions`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({
          permissions: permissionsPayload.data.permissions,
        }),
      },
    );
    expect(restorePermissions.status).toBe(200);

    const disableSales = await app.request(
      `${origin}${apiBasePath}/settings/members/${salesId}`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({ roleKey: 'crm-sales', status: 'disabled' }),
      },
    );
    expect(disableSales.status).toBe(200);
    const disabledRequest = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:list`,
      { headers: { cookie: salesCookie } },
    );
    expect(disabledRequest.status).toBe(401);

    const selfDisable = await app.request(
      `${origin}${apiBasePath}/settings/members/${memberId(
        await fetchMembers(app, adminCookie),
        'nocobase',
      )}`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({ roleKey: 'crm-admin', status: 'disabled' }),
      },
    );
    expect(selfDisable.status).toBe(409);
    await expect(selfDisable.json()).resolves.toMatchObject({
      code: 'CRM_MEMBER_SELF_DISABLE',
    });

    const adminId = memberId(await fetchMembers(app, adminCookie), 'nocobase');
    const removeLastAdmin = await app.request(
      `${origin}${apiBasePath}/settings/members/${adminId}`,
      {
        method: 'POST',
        headers: sameOriginHeaders(adminCookie),
        body: JSON.stringify({
          roleKey: 'crm-sales-manager',
          status: 'active',
        }),
      },
    );
    expect(removeLastAdmin.status).toBe(409);
    await expect(removeLastAdmin.json()).resolves.toMatchObject({
      code: 'CRM_LAST_ADMIN_REQUIRED',
    });
  });

  it('reports the real primary database without exposing its storage path', async () => {
    await createAdmin(app);
    const cookie = await signIn(app, 'nocobase', 'admin12345');

    const response = await app.request(
      `${origin}${apiBasePath}/runtime:resources`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        id: 'database:primary',
        kind: 'database',
        name: 'CRM 主数据库',
        status: 'active',
        provider: '@nocobase/database',
        details: {
          connectionName: 'sqlite',
          dialect: 'sqlite',
          driver: 'better-sqlite3',
        },
        error: null,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain(root);
    expect(JSON.stringify(payload)).not.toContain('crm.sqlite');

    const health = await app.request(`${origin}/healthz`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      resources: [
        {
          id: 'database:primary',
          status: 'active',
          details: { dialect: 'sqlite' },
        },
      ],
    });
  });

  it('summarizes the real CRM tables behind the primary database', async () => {
    await createAdmin(app);
    const cookie = await signIn(app, 'nocobase', 'admin12345');

    const response = await app.request(
      `${origin}${apiBasePath}/runtime:database-overview`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        collections: Array<{
          name: string;
          count: number;
          preview: Array<{ id: unknown; label: string; secondary: string }>;
        }>;
        totalRecords: number;
      };
    };
    expect(payload.data.totalRecords).toBe(29);
    expect(
      payload.data.collections.map(({ name, count }) => ({ name, count })),
    ).toEqual([
      { name: 'agent_crm_accounts', count: 4 },
      { name: 'agent_crm_contacts', count: 5 },
      { name: 'agent_crm_leads', count: 6 },
      { name: 'agent_crm_opportunities', count: 6 },
      { name: 'agent_crm_activities', count: 8 },
    ]);
    for (const collection of payload.data.collections) {
      expect(collection.preview).toHaveLength(3);
      expect(collection.preview[0]).toEqual({
        id: expect.anything(),
        label: expect.any(String),
        secondary: expect.any(String),
      });
    }
  });

  it('reports a sanitized database error when the startup check fails', async () => {
    const failingRuntime = createCrmRuntime({
      appName: 'crm',
      authBasePath: `${apiBasePath}/auth`,
      authSecret: 'crm-test-secret-that-is-at-least-32-characters',
      baseURL: `${origin}${apiBasePath}/auth`,
      databasePath: path.join(root, 'failing', 'crm.sqlite'),
      migrationsDirectory: path.join(root, 'missing-migrations'),
      publicBasePath: appBasePath,
      seedPath,
    });
    const failingApp = createTestApp(failingRuntime);

    try {
      const response = await failingApp.request(`${origin}/healthz`);
      expect(response.status).toBe(503);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        ok: false,
        resources: [
          {
            id: 'database:primary',
            status: 'error',
            error: {
              code: 'DATABASE_UNAVAILABLE',
              message: '数据库连接检查失败，请查看 Runtime 日志。',
            },
          },
        ],
      });
      expect(JSON.stringify(payload)).not.toContain(root);
      expect(JSON.stringify(payload)).not.toContain('crm.sqlite');
    } finally {
      await failingRuntime.close();
    }
  });

  it('supports authenticated CRUD for every CRM resource', async () => {
    await createAdmin(app);
    const cookie = await signIn(app, 'nocobase', 'admin12345');

    const account = await postAction(
      app,
      cookie,
      'agent_crm_accounts',
      'create',
      {
        name: '北辰科技',
        industry: '软件',
        status: 'prospect',
        tier: 'key',
      },
    );
    const contact = await postAction(
      app,
      cookie,
      'agent_crm_contacts',
      'create',
      {
        name: '陈晨',
        account: { id: account.id },
        email: 'chenchen@example.com',
        jobTitle: '数字化负责人',
      },
    );
    const lead = await postAction(app, cookie, 'agent_crm_leads', 'create', {
      name: '李然',
      company: '远山制造',
      status: 'new',
      source: 'referral',
      score: 82,
      email: 'liran@example.com',
    });
    const opportunity = await postAction(
      app,
      cookie,
      'agent_crm_opportunities',
      'create',
      {
        name: '北辰数字化项目',
        account: { id: account.id },
        stage: 'proposal',
        amount: 680000,
        probability: 60,
        expectedCloseDate: '2026-10-31T00:00:00.000Z',
      },
    );
    const activity = await postAction(
      app,
      cookie,
      'agent_crm_activities',
      'create',
      {
        subject: '确认北辰项目实施范围',
        type: 'meeting',
        status: 'planned',
        dueAt: '2026-09-01T02:00:00.000Z',
        opportunity: { id: opportunity.id },
        contact: { id: contact.id },
      },
    );

    const created: Array<[CrmResourceName, JsonRecord]> = [
      ['agent_crm_accounts', account],
      ['agent_crm_contacts', contact],
      ['agent_crm_leads', lead],
      ['agent_crm_opportunities', opportunity],
      ['agent_crm_activities', activity],
    ];

    for (const [resource, record] of created) {
      const getResponse = await app.request(
        `${origin}${apiBasePath}/${resource}:get?filterByTk=${record.id}`,
        { headers: { cookie } },
      );
      expect(getResponse.status, `${resource}:get`).toBe(200);

      const updated = await postAction(
        app,
        cookie,
        resource,
        'update',
        { notes: '已通过原生 CRM API 更新' },
        String(record.id),
      );
      expect(updated.notes, `${resource}:update`).toBe(
        '已通过原生 CRM API 更新',
      );

      const listResponse = await app.request(
        `${origin}${apiBasePath}/${resource}:list?page=1&pageSize=100`,
        { headers: { cookie } },
      );
      expect(listResponse.status, `${resource}:list`).toBe(200);
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string | number }>;
      };
      expect(
        listPayload.data.some((item) => String(item.id) === String(record.id)),
      ).toBe(true);
    }

    for (const [resource, record] of created.reverse()) {
      const destroyed = await postAction(
        app,
        cookie,
        resource,
        'destroy',
        undefined,
        String(record.id),
      );
      expect(String(destroyed.id), `${resource}:destroy`).toBe(
        String(record.id),
      );
    }
  });

  it('supports dashboard aggregation and relation appends', async () => {
    await createAdmin(app);
    const cookie = await signIn(app, 'nocobase', 'admin12345');

    const query = await postAction(
      app,
      cookie,
      'agent_crm_opportunities',
      'query',
      {
        measures: [
          { field: ['id'], aggregation: 'count', alias: 'opportunity_count' },
          { field: ['amount'], aggregation: 'sum', alias: 'pipeline_amount' },
        ],
        dimensions: [{ field: ['stage'], alias: 'stage' }],
        orders: [{ field: ['stage'], alias: 'stage', order: 'asc' }],
      },
    );
    expect(Array.isArray(query)).toBe(true);
    expect(query).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: expect.any(String),
          opportunity_count: expect.anything(),
          pipeline_amount: expect.anything(),
        }),
      ]),
    );

    const contacts = await app.request(
      `${origin}${apiBasePath}/agent_crm_contacts:list?page=1&pageSize=1&appends%5B%5D=account`,
      { headers: { cookie } },
    );
    expect(contacts.status).toBe(200);
    await expect(contacts.json()).resolves.toMatchObject({
      data: [
        {
          account: { id: expect.anything(), name: expect.any(String) },
        },
      ],
    });
  });

  it('rejects cross-site writes and invalid query identifiers', async () => {
    await createAdmin(app);
    const cookie = await signIn(app, 'nocobase', 'admin12345');

    const crossSite = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:create`,
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          origin: 'https://attacker.example',
        },
        body: JSON.stringify({ name: '不应创建', status: 'prospect' }),
      },
    );
    expect(crossSite.status).toBe(403);

    const invalidSort = await app.request(
      `${origin}${apiBasePath}/agent_crm_accounts:list?sort=${encodeURIComponent('name;drop table user')}`,
      { headers: { cookie } },
    );
    expect(invalidSort.status).toBe(400);

    const invalidAlias = await app.request(
      `${origin}${apiBasePath}/agent_crm_opportunities:query`,
      {
        method: 'POST',
        headers: sameOriginHeaders(cookie),
        body: JSON.stringify({
          measures: [
            {
              field: ['id'],
              aggregation: 'count',
              alias: 'count); drop table user; --',
            },
          ],
        }),
      },
    );
    expect(invalidAlias.status).toBe(400);

    const users = await app.request(`${origin}${apiBasePath}/user:list`, {
      headers: { cookie },
    });
    expect(users.status).toBe(200);
  });
});

function createTestRuntime(root: string): CrmRuntime {
  return createCrmRuntime({
    appName: 'crm',
    authBasePath: `${apiBasePath}/auth`,
    authSecret: 'crm-test-secret-that-is-at-least-32-characters',
    baseURL: `${origin}${apiBasePath}/auth`,
    databasePath: path.join(root, 'crm.sqlite'),
    migrationsDirectory,
    publicBasePath: appBasePath,
    seedPath,
  });
}

function createTestApp(runtime: CrmRuntime): Hono {
  return createApp({
    appName: 'crm',
    basePath: appBasePath,
    browserBasePath: appBasePath,
    browserApiUrl: apiBasePath,
    apiProxyPath: apiBasePath,
    crmRuntime: runtime,
  });
}

async function snapshotResources(
  runtime: CrmRuntime,
): Promise<Record<CrmResourceName, { count: number; rows: JsonRecord[] }>> {
  const entries = await Promise.all(
    CRM_RESOURCES.map(async (resource) => {
      const result = await runtime.service.list(resource, { pageSize: 100 });
      return [resource, { count: result.count, rows: result.rows }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    CrmResourceName,
    { count: number; rows: JsonRecord[] }
  >;
}

async function createAdmin(app: Hono): Promise<void> {
  const response = await signUp(app, {
    name: 'CRM Admin',
    username: 'nocobase',
    email: 'admin@example.com',
    password: 'admin12345',
  });
  expect(response.status).toBe(200);
}

async function signUp(
  app: Hono,
  values: {
    name: string;
    username: string;
    email: string;
    password: string;
  },
): Promise<Response> {
  return app.request(`${origin}${apiBasePath}/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
}

async function signIn(
  app: Hono,
  username: string,
  password: string,
): Promise<string> {
  const response = await app.request(
    `${origin}${apiBasePath}/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain('session_token');
  return setCookie?.split(';')[0] ?? '';
}

interface TestMember {
  id: string;
  username: string | null;
}

async function fetchMembers(app: Hono, cookie: string): Promise<TestMember[]> {
  const response = await app.request(
    `${origin}${apiBasePath}/settings/members`,
    { headers: { cookie } },
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { data: TestMember[] };
  return payload.data;
}

async function createMember(
  app: Hono,
  cookie: string,
  values: {
    name: string;
    username: string;
    email: string;
    password: string;
    roleKey: 'crm-admin' | 'crm-sales-manager' | 'crm-sales';
  },
): Promise<TestMember[]> {
  const response = await app.request(
    `${origin}${apiBasePath}/settings/members`,
    {
      method: 'POST',
      headers: sameOriginHeaders(cookie),
      body: JSON.stringify(values),
    },
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { data: TestMember[] };
  return payload.data;
}

function memberId(members: readonly TestMember[], username: string): string {
  const member = members.find((item) => item.username === username);
  expect(member, `member ${username}`).toBeDefined();
  return member?.id ?? '';
}

async function permissionAuditCount(knex: Knex): Promise<number> {
  const row = await knex('authzAuditLogs')
    .where({ event: 'crm.role.permissions.updated' })
    .count({ count: '*' })
    .first();
  return Number(row?.count ?? 0);
}

function postAction(
  app: Hono,
  cookie: string,
  resource: CrmResourceName,
  action: 'query',
  body: JsonRecord,
  id?: string,
): Promise<JsonRecord[]>;
function postAction(
  app: Hono,
  cookie: string,
  resource: CrmResourceName,
  action: 'create' | 'update' | 'destroy',
  body?: JsonRecord,
  id?: string,
): Promise<JsonRecord>;
async function postAction(
  app: Hono,
  cookie: string,
  resource: CrmResourceName,
  action: 'create' | 'update' | 'destroy' | 'query',
  body?: JsonRecord,
  id?: string,
): Promise<JsonRecord | JsonRecord[]> {
  const query = id ? `?filterByTk=${encodeURIComponent(id)}` : '';
  const response = await app.request(
    `${origin}${apiBasePath}/${resource}:${action}${query}`,
    {
      method: 'POST',
      headers: sameOriginHeaders(cookie),
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  expect(response.status, `${resource}:${action}`).toBe(200);
  const payload = (await response.json()) as { data: unknown };
  return payload.data as JsonRecord | JsonRecord[];
}

function sameOriginHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    origin,
  };
}
