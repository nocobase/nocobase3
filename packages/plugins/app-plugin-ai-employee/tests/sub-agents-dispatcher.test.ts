import { describe, expect, it, vi } from 'vitest';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';

import { SubAgentsDispatcher } from '../server/manager/sub-agents/dispatcher.js';

const unusedDependencies = {
  aiEmployeesManager: {} as never,
  builtInManager: {} as never,
  llmStreamCachedManager: {} as never,
  knowledgeBaseManager: {} as never,
  workContextHandler: {} as never,
  documentLoaders: {} as never,
};

describe('SubAgentsDispatcher direct dependencies', () => {
  it('uses the injected conversation manager when rejecting an interrupted sub-agent', async () => {
    const getUserDecisions = vi.fn().mockResolvedValue({
      decisions: [{ type: 'reject' }],
    });
    const dispatcher = new SubAgentsDispatcher({
      repositories: {
        aiConversations: {
          findOne: vi.fn().mockResolvedValue({ sessionId: 'main-session' }),
        },
        aiToolMessages: {
          findOne: vi.fn().mockResolvedValue({ messageId: 'main-message' }),
          update: vi.fn().mockResolvedValue(1),
        },
        aiMessages: {
          findOne: vi
            .fn()
            .mockResolvedValueOnce({
              metadata: {
                subAgentConversations: [{ sessionId: 'sub-session' }],
              },
            })
            .mockResolvedValueOnce({
              sessionId: 'sub-session',
              messageId: 'sub-message',
            }),
        },
      } as never,
      aiConversationsManager: { getUserDecisions } as never,
      ...unusedDependencies,
    });

    await expect(
      dispatcher.reject('main-session', {
        auth: { user: { id: 'user-1' } },
      } as never),
    ).resolves.toEqual({ decisions: [{ type: 'reject' }] });
    expect(getUserDecisions).toHaveBeenCalledWith('sub-message');
  });

  it('passes the resolved execution context to sub-agent tools', async () => {
    const invoke = vi.fn().mockResolvedValue({
      messages: [{ content: 'Search result' }],
    });
    const resolvedModel = { llmService: 'openai', model: 'gpt-5' };
    const createAIEmployee = vi.fn().mockResolvedValue({ invoke });
    const has = vi.fn(() => false);
    const dispatcher = new SubAgentsDispatcher({
      ai: {} as never,
      database: {} as never,
      databaseManager: {} as never,
      logger: {} as never,
      caching: {} as never,
      fileStorage: {} as never,
      snowflake: {} as never,
      repositories: {
        aiMessages: { findOne: vi.fn().mockResolvedValue(null) },
      } as never,
      aiEmployeesManager: {
        resolveModel: vi.fn().mockResolvedValue(resolvedModel),
      } as never,
      aiConversationsManager: {
        getUserDecisions: vi.fn(),
      } as never,
      builtInManager: {} as never,
      llmStreamCachedManager: {} as never,
      knowledgeBaseManager: {} as never,
      workContextHandler: {} as never,
      documentLoaders: {} as never,
      container: {
        has,
        resolve: vi.fn(() => ({ createAIEmployee })),
      } as never,
    });

    await expect(
      dispatcher.run(
        {
          sessionId: 'sub-session',
          employee: { username: 'researcher' } as never,
          model: resolvedModel,
          question: 'Find current information',
          webSearch: true,
          messages: [
            {
              role: 'user',
              content: { type: 'text', content: 'Parent context' },
            },
          ],
        },
        {
          actor: { id: 'user-1', roles: ['member'], isRoot: false },
          execution: { timezone: 'Asia/Shanghai' },
        },
      ),
    ).resolves.toBe('Search result');

    const request = invoke.mock.calls[0][0];
    expect(request.context.agentContext.state).toMatchObject({
      sessionId: 'sub-session',
      model: resolvedModel,
      webSearch: true,
      timezone: 'Asia/Shanghai',
    });
    expect(request.context.agentContext.state.messages).toHaveLength(1);
    expect(has).toHaveBeenCalledWith(authorizationToken);
    expect(request.context.agentContext.actor.id).toBe('user-1');
    expect(createAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'user-1', roles: ['member'], isRoot: false },
      }),
    );
    await expect(
      request.context.agentContext.services.data.getDataSources({}),
    ).rejects.toThrow('Data access denied');
  });
});
