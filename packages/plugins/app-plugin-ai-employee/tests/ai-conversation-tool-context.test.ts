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
      input: {
        sessionId: 'session-1',
        aiEmployee: 'researcher',
        messages,
        model: resolvedModel,
        webSearch: true,
        stream: false,
      },
      execution: { timezone: 'Asia/Shanghai' },
      translate: (key) => key,
    });

    expect(createAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ webSearch: true }),
    );
    const request = invoke.mock.calls[0][0];
    expect(request.context.agentContext.state).toMatchObject({
      sessionId: 'session-1',
      messages,
      model: resolvedModel,
      webSearch: true,
      timezone: 'Asia/Shanghai',
    });
  });
});
