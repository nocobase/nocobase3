import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { createAIEmployeeRoutes } from '../../server/route/index.js';
import { createTestAIEmployeeFixture } from './test-context.js';

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
  'aiMcpServers:testConnection': 'POST',
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
  'aiConversations:listAll',
  'aiConversations:getAllMessages',
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
  'aiTools:listAll',
  'aiTools:getDetails',
  ...managedActions('aiSkills'),
  'aiSkills:listAll',
  'aiSkills:getDetails',
  ...managedActions('llmServices'),
  'aiMcpServers:list',
  'aiMcpServers:get',
  'aiMcpServers:testConnection',
  'aiMcpServers:updateEnabled',
  'aiMcpServers:updateToolPermission',
  'aiMcpServers:listTools',
];
for (const resource of ['aiTools', 'aiSkills', 'llmServices']) {
  methods[`${resource}:create`] = 'POST';
  methods[`${resource}:update`] = 'PUT';
  methods[`${resource}:destroy`] = 'DELETE';
}
methods['aiMcpServers:updateEnabled'] = 'POST';
methods['aiMcpServers:updateToolPermission'] = 'POST';

describe('AI action routers', () => {
  it('registers each supported local action once under /api/ai with a precise method', () => {
    const app = new Hono();
    const { deps, services } = createTestAIEmployeeFixture();
    const routes = createAIEmployeeRoutes({
      authentication: deps.auth,
      authorization: deps.authorization,
      services,
      logger: deps.logging.getLogger('ai-employee-test'),
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
    const { deps, services } = createTestAIEmployeeFixture();
    services.ready = async () => undefined;
    services.employeeService.list = async () => [];
    services.conversationService.unreadCounts = async () => ({
      conversationUnreadCount: 3,
    });
    const routes = createAIEmployeeRoutes({
      authentication: deps.auth,
      authorization: deps.authorization,
      services,
      logger: deps.logging.getLogger('ai-employee-test'),
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
    });

    const legacyMethod = await app.request(
      'http://localhost/api/ai/aiEmployees:list',
      { method: 'POST', body: JSON.stringify({ values: {} }) },
    );
    expect(legacyMethod.status).toBe(404);
  });

  it('preserves the legacy error envelope while mapping explicit statuses', async () => {
    const app = new Hono();
    const { deps, services } = createTestAIEmployeeFixture();
    services.ready = async () => undefined;
    const routes = createAIEmployeeRoutes({
      authentication: deps.auth,
      authorization: deps.authorization,
      services,
      logger: deps.logging.getLogger('ai-employee-test'),
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
  it('keeps a model the client did not send as a resolved reference out of the state', async () => {
    const app = new Hono();
    const { deps, services } = createTestAIEmployeeFixture();
    services.ready = async () => undefined;
    const sendMessages = vi.fn(async () => undefined);
    services.conversationService.sendMessages = sendMessages as never;
    const routes = createAIEmployeeRoutes({
      authentication: deps.auth,
      authorization: deps.authorization,
      services,
      logger: deps.logging.getLogger('ai-employee-test'),
    });
    app.route('/api/ai', routes);

    const send = async (model: unknown) => {
      const response = await app.request(
        'http://localhost/api/ai/aiConversations:sendMessages',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'session-1',
            aiEmployee: 'dara',
            messages: [],
            model,
          }),
        },
      );
      // The action answers over SSE, so the handler is only done once the
      // stream is.
      await response.text();
    };

    await send({ llmService: 'openai' });
    await send('gpt-5');
    await send({ llmService: 'openai', model: 'gpt-5', reasoning: 'ignored' });

    // `AgentState.model` promises every tool a resolved reference, so a partial
    // one is dropped rather than carried, and extras do not ride along.
    expect(sendMessages.mock.calls[0][0].state.model).toBeUndefined();
    expect(sendMessages.mock.calls[1][0].state.model).toBeUndefined();
    expect(sendMessages.mock.calls[2][0].state.model).toEqual({
      llmService: 'openai',
      model: 'gpt-5',
    });
  });

  it('wires each managed resource to a dedicated service instance', () => {
    const { deps, services } = createTestAIEmployeeFixture();
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
