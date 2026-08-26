// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { createServer as createHttpServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';

import { createApp } from '../../server/app.js';

const servers: Server[] = [];
const apiBasePath = '/app-template-default/v2/api';
const actorHeaders = {
  'content-type': 'application/json',
  'x-user-id': 'user-1',
  'x-roles': 'member',
};
const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;

function createTestApp(options: { nocoBaseApiUrl?: string | false } = {}) {
  return createApp({
    basePath: '/app-template-default',
    nocoBaseApiUrl: options.nocoBaseApiUrl ?? false,
  });
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  if (originalDeepSeekApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
  }
});

describe('local AI server migration', () => {
  it('exposes the installed singleton AIManager to additional Hono routes through c.var.ai', async () => {
    const app = createTestApp();
    app.get('/ai-manager', (context) =>
      context.json({
        installed: Boolean(context.var.ai),
        contextInstalled: Boolean(context.var.ctx),
        sharedManager: context.var.ctx.ai === context.var.ai,
        currentUser: context.var.ctx.currentUser,
      }),
    );

    const response = await app.request('http://localhost/ai-manager');

    expect(await response.json()).toEqual({
      installed: true,
      contextInstalled: true,
      sharedManager: true,
      currentUser: { id: 'anonymous', roles: ['member'], isRoot: false },
    });

    const rootResponse = await app.request('http://localhost/ai-manager', {
      headers: { 'x-user-id': 'root-user', 'x-roles': 'root,admin' },
    });
    expect((await rootResponse.json()).currentUser).toEqual({
      id: 'root-user',
      roles: ['root', 'admin'],
      isRoot: true,
    });
  });

  it('loads migrated built-in resources and serves AI actions locally before the legacy proxy', async () => {
    let upstreamRequests = 0;
    const target = await startHttpStub((_request, response) => {
      upstreamRequests += 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { proxied: true } }));
    });
    const app = createTestApp({ nocoBaseApiUrl: `${target}/api` });

    const employees = await requestJSON(app, 'aiEmployees:listByUser', {
      method: 'POST',
      body: {},
    });
    expect(employees.response.headers.get('x-local-ai')).toBe('1');
    const usernames = employees.payload.data.map((e: any) => e.username);
    expect(usernames).toContain('viz');
    expect(usernames).toContain('atlas');
    // builder employees (nathan/orin/dara) are admin-only server-side
    expect(usernames).not.toContain('nathan');
    expect(usernames).not.toContain('orin');
    expect(usernames).not.toContain('dara');
    expect(upstreamRequests).toBe(0);

    const models = await requestJSON(app, 'ai:listAllEnabledModels', {
      method: 'POST',
      body: {},
    });
    expect(models.payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          llmService: 'deepseek',
          provider: 'deepseek',
          enabledModels: [
            { label: 'deepseek-v4-flash', value: 'deepseek-v4-flash' },
          ],
        }),
      ]),
    );

    const rootHeaders = {
      'content-type': 'application/json',
      'x-user-id': 'root-user',
      'x-roles': 'root',
    };
    const tools = await requestJSON(app, 'aiTools:list', {
      method: 'GET',
      headers: rootHeaders,
    });
    expect(tools.payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definition: expect.objectContaining({ name: 'formFiller' }),
        }),
      ]),
    );

    // The generic loader executes CommonJS application resources from dist/ai.
    // The application fixtures are consequently asserted whenever that build output exists.
    if (
      existsSync(
        path.resolve(
          'dist',
          'ai',
          'employees',
          'application-validation',
          'index.js',
        ),
      )
    ) {
      expect(tools.payload.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            definition: expect.objectContaining({
              name: 'application-validation',
            }),
          }),
        ]),
      );
      const skills = await requestJSON(app, 'aiSkills:list', {
        method: 'GET',
        headers: rootHeaders,
      });
      expect(skills.payload.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'data-query' }),
          expect.objectContaining({ name: 'application-validation' }),
        ]),
      );
    }

    const proxied = await app.request(
      `http://localhost${apiBasePath}/systemSettings:get`,
    );
    expect(await proxied.json()).toEqual({ data: { proxied: true } });
    expect(upstreamRequests).toBe(1);
  });

  it('enforces file ownership and returns a deep-data upload envelope', async () => {
    const app = createTestApp();
    const form = new FormData();
    form.append(
      'file',
      new File(['secret'], 'secret.txt', { type: 'text/plain' }),
    );
    const upload = await app.request(
      `http://localhost${apiBasePath}/aiFiles:create`,
      { method: 'POST', headers: { 'x-user-id': 'user-1' }, body: form },
    );
    const payload = (await upload.json()) as any;
    expect(payload.data.data).toMatchObject({
      filename: 'secret.txt',
      size: 6,
    });
    const url = payload.data.data.url as string;

    const ownerPreview = await app.request(`http://localhost${url}`, {
      headers: { 'x-user-id': 'user-1' },
    });
    expect(ownerPreview.status).toBe(200);
    expect(await ownerPreview.text()).toBe('secret');
    const otherPreview = await app.request(`http://localhost${url}`, {
      headers: { 'x-user-id': 'user-2' },
    });
    expect(otherPreview.status).toBe(403);
  });

  it('restricts management and exposes its resource mutations through local APIs', async () => {
    const app = createTestApp();
    const forbidden = await requestJSON(app, 'aiEmployees:create', {
      method: 'POST',
      body: { username: 'managed', profile: { nickname: 'Managed' } },
    });
    expect(forbidden.response.status).toBe(403);

    const rootHeaders = {
      'content-type': 'application/json',
      'x-user-id': 'root-user',
      'x-roles': 'root',
    };
    const employee = await requestJSON(app, 'aiEmployees:create', {
      method: 'POST',
      body: { username: 'managed', profile: { nickname: 'Managed' } },
      headers: rootHeaders,
    });
    expect(employee.payload.data).toMatchObject({
      username: 'managed',
      nickname: 'Managed',
    });

    const rootEmployees = await requestJSON(app, 'aiEmployees:listByUser', {
      method: 'POST',
      body: {},
      headers: rootHeaders,
    });
    expect(rootEmployees.payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'managed' }),
      ]),
    );

    const tool = await requestJSON(app, 'aiTools:create', {
      method: 'POST',
      body: {
        scope: 'GENERAL',
        execution: 'frontend',
        defaultPermission: 'ALLOW',
        definition: {
          name: 'managedFrontendTool',
          description: 'Managed tool',
          schema: { type: 'object' },
        },
      },
      headers: rootHeaders,
    });
    expect(tool.payload.data).toMatchObject({
      definition: { name: 'managedFrontendTool' },
    });

    const updatedTool = await requestJSON(
      app,
      'aiTools:update?filterByTk=managedFrontendTool',
      {
        method: 'PUT',
        body: {
          definition: { description: 'Updated managed tool' },
          defaultPermission: 'ASK',
        },
        headers: rootHeaders,
      },
    );
    expect(updatedTool.payload.data).toMatchObject({
      defaultPermission: 'ASK',
      definition: { description: 'Updated managed tool' },
    });

    const skill = await requestJSON(app, 'aiSkills:create', {
      method: 'POST',
      body: {
        name: 'managed-skill',
        scope: 'GENERAL',
        content: 'Managed content',
        tools: ['managedFrontendTool'],
      },
      headers: rootHeaders,
    });
    expect(skill.payload.data).toMatchObject({ name: 'managed-skill' });

    const service = await requestJSON(app, 'llmServices:create', {
      method: 'POST',
      body: {
        name: 'managed-openai',
        title: 'Managed OpenAI',
        provider: 'openai',
        enabledModels: ['gpt-managed'],
        enabled: false,
        options: { apiKey: 'top-secret', baseURL: 'http://localhost' },
      },
      headers: rootHeaders,
    });
    expect(service.payload.data.options).toEqual({
      apiKey: '***',
      baseURL: 'http://localhost',
    });

    const mcp = await requestJSON(app, 'aiMcpServers:create', {
      method: 'POST',
      body: {
        name: 'managed-mcp',
        transport: 'http',
        url: 'http://localhost/mcp',
        enabled: false,
        headers: { Authorization: 'Bearer secret' },
      },
      headers: rootHeaders,
    });
    expect(mcp.payload.data.headers.Authorization).toBe('***');

    await requestJSON(app, 'aiTools:destroy?filterByTk=managedFrontendTool', {
      method: 'DELETE',
      headers: rootHeaders,
    });
    const tools = await requestJSON(app, 'aiTools:list', {
      method: 'GET',
      headers: rootHeaders,
    });
    expect(tools.payload.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definition: { name: 'managedFrontendTool' },
        }),
      ]),
    );
  });
});

async function requestJSON(
  app: ReturnType<typeof createApp>,
  action: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  },
) {
  const headers = { ...actorHeaders, ...options.headers };
  const response = await app.request(
    `http://localhost${apiBasePath}/${action}`,
    {
      method: options.method,
      headers,
      body:
        options.method === 'GET'
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body ?? {}),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as any;
  return { response, payload };
}

function startHttpStub(
  handler: Parameters<typeof createHttpServer>[0],
): Promise<string> {
  const server = createHttpServer(handler);
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('Failed to resolve stub address'));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
