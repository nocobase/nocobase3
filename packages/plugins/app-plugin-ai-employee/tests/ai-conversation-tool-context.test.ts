import { describe, expect, it, vi } from 'vitest';
import { AIConversationService } from '../server/service/ai-conversation-service.js';

describe('AIConversationService tool context', () => {
  it('passes the current model and web search state to tools', async () => {
    const resolvedModel = { llmService: 'openai', model: 'gpt-5' };
    const invoke = vi.fn().mockResolvedValue({ messages: [] });
    const cancelToolCall = vi.fn().mockResolvedValue(undefined);
    const createAIEmployee = vi.fn().mockResolvedValue({
      invoke,
      cancelToolCall,
    });
    const service = new AIConversationService({
      ai: {} as never,
      database: {} as never,
      databaseManager: {} as never,
      logger: { error: vi.fn() } as never,
      caching: {} as never,
      fileStorage: {} as never,
      snowflake: {} as never,
      repositories: {
        aiConversations: {
          count: vi.fn().mockResolvedValue(0),
          update: vi.fn(),
        },
        aiEmployees: {
          findOne: vi.fn().mockResolvedValue({
            username: 'researcher',
            enabled: true,
          }),
        },
      } as never,
      aiEmployeesManager: {
        resolveModel: vi.fn().mockResolvedValue(resolvedModel),
      } as never,
      aiConversationsManager: {
        getConversation: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          title: 'Existing conversation',
          category: 'chat',
          options: {},
        }),
      } as never,
      builtInManager: {} as never,
      llmStreamCachedManager: {} as never,
      subAgentsDispatcher: {
        isInterrupted: vi.fn().mockResolvedValue(false),
      } as never,
      knowledgeBaseManager: {} as never,
      workContextHandler: {} as never,
      documentLoaders: {} as never,
      agentServiceFactory: { createAIEmployee } as never,
    });
    const messages = [
      {
        role: 'user' as const,
        content: { type: 'text' as const, content: 'Search current news' },
      },
    ];

    await service.sendMessages({
      actor: { id: 'user-1', roles: ['member'], isRoot: false },
      sessionId: 'session-1',
      aiEmployee: 'researcher',
      stream: false,
      turn: {
        messages,
        model: resolvedModel,
        webSearch: true,
        timezone: 'Asia/Shanghai',
      },
      transport: { translate: (key) => key },
    });

    // The tool context is fixed when the AgentService is created, so the turn
    // reaches the factory whole and the request carries none of it. The session
    // is named once, beside the turn rather than inside it.
    expect(createAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        from: 'main-agent',
        turn: {
          messages,
          model: resolvedModel,
          webSearch: true,
          timezone: 'Asia/Shanghai',
        },
      }),
    );
    const request = invoke.mock.calls[0][0];
    expect(request).not.toHaveProperty('model');
    expect(request).not.toHaveProperty('context');
    expect(request.userMessages).toEqual(messages);
  });
});
