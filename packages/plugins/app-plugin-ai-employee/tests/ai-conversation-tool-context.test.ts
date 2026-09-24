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
      aiEmployee: 'researcher',
      messages,
      stream: false,
      state: {
        sessionId: 'session-1',
        model: resolvedModel,
        webSearch: true,
        timezone: 'Asia/Shanghai',
      },
      transport: { translate: (key) => key },
    });

    // The tool context is fixed when the AgentService is created, so the state
    // reaches the factory whole and the request carries none of it. No
    // sub-agent was interrupted, so nothing is handed over.
    expect(createAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'main-agent',
        runtime: expect.objectContaining({ translate: expect.any(Function) }),
        state: {
          sessionId: 'session-1',
          model: resolvedModel,
          webSearch: true,
          timezone: 'Asia/Shanghai',
          handoffMessages: undefined,
        },
      }),
    );
    const request = invoke.mock.calls[0][0];
    expect(request).not.toHaveProperty('model');
    expect(request).not.toHaveProperty('context');
    expect(request.userMessages).toEqual(messages);
  });

  it('hands an interrupted sub-agent the message that interrupted it', async () => {
    const resolvedModel = { llmService: 'openai', model: 'gpt-5' };
    const decisions = { decisions: [{ type: 'reject' as const }] };
    const invoke = vi.fn().mockResolvedValue({ messages: [] });
    const cancelToolCall = vi.fn().mockResolvedValue(undefined);
    const createAIEmployee = vi.fn().mockResolvedValue({
      invoke,
      cancelToolCall,
    });
    const reject = vi.fn().mockResolvedValue(decisions);
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
          findOne: vi
            .fn()
            .mockResolvedValue({ username: 'researcher', enabled: true }),
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
        isInterrupted: vi.fn().mockResolvedValue(true),
        reject,
      } as never,
      knowledgeBaseManager: {} as never,
      workContextHandler: {} as never,
      documentLoaders: {} as never,
      agentServiceFactory: { createAIEmployee } as never,
    });
    const messages = [
      {
        role: 'user' as const,
        content: { type: 'text' as const, content: 'Use the other one' },
      },
    ];

    await service.sendMessages({
      actor: { id: 'user-1', roles: ['member'], isRoot: false },
      aiEmployee: 'researcher',
      messages,
      stream: false,
      state: { sessionId: 'session-1' },
      transport: { translate: (key) => key },
    });

    // The message answers the sub-agent's pending question, so it reaches the
    // agent state for `dispatch-sub-agent-task` to hand over, and the main
    // agent is resumed with the decisions alone.
    expect(reject).toHaveBeenCalledWith('session-1', 'user-1');
    expect(createAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { sessionId: 'session-1', handoffMessages: messages },
      }),
    );
    expect(invoke).toHaveBeenCalledWith({ userDecisions: decisions });
    // The interrupted turn resolves the pending call through the decisions, so
    // nothing cancels it a second time.
    expect(cancelToolCall).not.toHaveBeenCalled();
  });
});
