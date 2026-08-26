import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { registerAIEmployeeRoutes } from '../../server/routes/router.js';
import { createTestAIEmployeeRuntime } from './test-context.js';

const expectedActions = [
  'ai:listAllEnabledModels',
  'ai:listLLMProviders',
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

describe('AI action routers', () => {
  it('registers each supported local action at one exact path', () => {
    const app = new Hono();
    const runtime = createTestAIEmployeeRuntime();

    registerAIEmployeeRoutes(app, '/v2/api');

    const localRoutes = app.routes.filter((route) =>
      route.path.startsWith('/v2/api/'),
    );
    expect(localRoutes).toHaveLength(expectedActions.length);
    expect(localRoutes).toEqual(
      expect.arrayContaining(
        expectedActions.map((action) =>
          expect.objectContaining({
            method: 'ALL',
            path: `/v2/api/${action}`,
          }),
        ),
      ),
    );
    expect(new Set(localRoutes.map((route) => route.path)).size).toBe(
      expectedActions.length,
    );
    expect(localRoutes.some((route) => route.path.endsWith('/*'))).toBe(false);
  });

  it('wires each managed resource to a dedicated service instance', () => {
    const runtime = createTestAIEmployeeRuntime();

    expect(runtime.employeeService.constructor.name).toBe('AIEmployeeService');
    expect(runtime.toolService.constructor.name).toBe('AIToolService');
    expect(runtime.skillService.constructor.name).toBe('AISkillService');
    expect(runtime.llmService.constructor.name).toBe('LLMService');
    expect(runtime.mcpServerService.constructor.name).toBe(
      'AIMCPServerService',
    );
    expect(
      new Set([
        runtime.employeeService,
        runtime.toolService,
        runtime.skillService,
        runtime.llmService,
        runtime.mcpServerService,
      ]).size,
    ).toBe(5);
  });
});

function managedActions(prefix: string): string[] {
  return ['list', 'get', 'create', 'update', 'destroy'].map(
    (action) => `${prefix}:${action}`,
  );
}
