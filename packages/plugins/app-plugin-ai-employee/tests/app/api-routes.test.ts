import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createAIEmployeeRoutes } from '../../server/routes/index.js';
import type { Context } from '../../server/internal/runtime-context.js';
import { createTestAIEmployeeFixture } from './test-context.js';
import { createTestAppDeps } from './test-app-deps.js';

const methods: Record<string, string> = {
  'ai:listProviderModels': 'POST',
  'ai:testFlight': 'POST',
  'aiEmployees:updateUserPrompt': 'POST',
  'aiEmployees:create': 'POST',
  'aiEmployees:update': 'PUT',
  'aiEmployees:destroy': 'DELETE',
  'aiConversations:create': 'POST',
  'aiConversations:update': 'PUT',
  'aiConversations:updateOptions': 'PUT',
  'aiConversations:destroy': 'DELETE',
  'aiConversations:sendMessages': 'POST',
  'aiConversations:resendMessages': 'POST',
  'aiConversations:updateUserDecision': 'POST',
  'aiConversations:resumeToolCall': 'POST',
  'aiConversations:resumeStream': 'POST',
  'aiConversations:abort': 'POST',
  'aiConversations:updateToolArgs': 'POST',
  'aiFiles:create': 'POST',
};

const expectedActions = [
  'ai:listAllEnabledModels',
  'ai:listLLMProviders',
  'ai:listLLMServices',
  'ai:listModels',
  'ai:listProviderModels',
  'ai:testFlight',
  'aiEmployees:listByUser',
  'aiEmployees:updateUserPrompt',
  'aiEmployees:getTemplates',
  'aiEmployees:list',
  'aiEmployees:get',
  'aiEmployees:create',
  'aiEmployees:update',
  'aiEmployees:destroy',
  'aiConversations:list',
  'aiConversations:unreadCounts',
  'aiConversations:unreadCount',
  'aiConversations:getMessages',
  'aiConversations:get',
  'aiConversations:create',
  'aiConversations:update',
  'aiConversations:updateOptions',
  'aiConversations:destroy',
  'aiConversations:sendMessages',
  'aiConversations:resendMessages',
  'aiConversations:updateUserDecision',
  'aiConversations:resumeToolCall',
  'aiConversations:resumeStream',
  'aiConversations:abort',
  'aiConversations:updateToolArgs',
  'aiFiles:create',
  'aiFiles:preview',
  ...managedActions('aiTools'),
  ...managedActions('aiSkills'),
  ...managedActions('llmServices'),
  ...managedActions('aiMcpServers'),
];

for (const resource of ['aiTools', 'aiSkills', 'llmServices', 'aiMcpServers']) {
  methods[`${resource}:create`] = 'POST';
  methods[`${resource}:update`] = 'PUT';
  methods[`${resource}:destroy`] = 'DELETE';
}

describe('AI action routers', () => {
  it('registers each supported local action once under /api/ai with a precise method', () => {
    const app = new Hono();
    const { context: runtime, services } = createTestAIEmployeeFixture();
    const routes = createAIEmployeeRoutes({
      authentication: createTestAppDeps().auth,
      services,
      logger: runtime.logger,
    });
    app.route('/api/ai', routes);

    const localRoutes = app.routes.filter(
      (route) => route.path.startsWith('/api/ai/') && route.method !== 'ALL',
    );
    expect(localRoutes).toHaveLength(expectedActions.length);
    expect(localRoutes).toEqual(
      expect.arrayContaining(
        expectedActions.map((action) =>
          expect.objectContaining({
            method: methods[action] ?? 'GET',
            path: `/api/ai/${action}`,
          }),
        ),
      ),
    );
    expect(new Set(localRoutes.map((route) => route.path)).size).toBe(
      expectedActions.length,
    );
    expect(
      app.routes.some(
        (route) => route.method === 'ALL' && route.path === '/api/ai/*',
      ),
    ).toBe(true);
    expect(app.routes.some((route) => route.path.startsWith('/v2/api/'))).toBe(
      false,
    );
  });

  it('returns direct JSON with the local marker and rejects legacy methods', async () => {
    const app = new Hono();
    const { context: runtime, services } = createTestAIEmployeeFixture();
    services.ready = async () => undefined;
    services.employeeService.list = async () => [];
    services.conversationService.unreadCounts = async () => ({
      conversationUnreadCount: 3,
      workflowTaskUnreadCount: 0,
    });
    const routes = createAIEmployeeRoutes({
      authentication: createTestAppDeps().auth,
      services,
      logger: runtime.logger,
    });
    app.route('/api/ai', routes);

    const response = await app.request(
      'http://localhost/api/ai/aiEmployees:list',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-local-ai')).toBe('1');
    expect(await response.json()).toEqual(expect.any(Array));

    const unreadResponse = await app.request(
      'http://localhost/api/ai/aiConversations:unreadCounts',
    );
    expect(unreadResponse.status).toBe(200);
    expect(await unreadResponse.json()).toEqual({
      conversationUnreadCount: 3,
      workflowTaskUnreadCount: 0,
    });

    const legacyMethod = await app.request(
      'http://localhost/api/ai/aiEmployees:list',
      { method: 'POST', body: JSON.stringify({ values: {} }) },
    );
    expect(legacyMethod.status).toBe(404);
  });

  it('preserves the legacy error envelope while mapping explicit statuses', async () => {
    const app = new Hono();
    const { context: runtime, services } = createTestAIEmployeeFixture();
    services.ready = async () => undefined;
    const routes = createAIEmployeeRoutes({
      authentication: createTestAppDeps().auth,
      services,
      logger: runtime.logger,
    });
    app.route('/api/ai', routes);

    const response = await app.request(
      'http://localhost/api/ai/aiEmployees:get',
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: [{ message: 'key is required' }],
      error: 'key is required',
    });
  });
  it('wires each managed resource to a dedicated service instance', () => {
    const { context: runtime, services } = createTestAIEmployeeFixture();
    expect(services.employeeService.constructor.name).toBe('AIEmployeeService');
    expect(services.toolService.constructor.name).toBe('AIToolService');
    expect(services.skillService.constructor.name).toBe('AISkillService');
    expect(services.llmService.constructor.name).toBe('LLMService');
    expect(services.mcpServerService.constructor.name).toBe(
      'AIMCPServerService',
    );
    expect(services.conversationService.constructor.name).toBe(
      'AIConversationService',
    );
    expect(
      new Set([
        services.employeeService,
        services.toolService,
        services.skillService,
        services.llmService,
        services.mcpServerService,
        services.conversationService,
      ]).size,
    ).toBe(6);
  });
});

function managedActions(prefix: string): string[] {
  return ['list', 'get', 'create', 'update', 'destroy'].map(
    (action) => `${prefix}:${action}`,
  );
}
