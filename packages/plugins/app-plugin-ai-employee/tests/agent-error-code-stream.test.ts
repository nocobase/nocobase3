import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { AgentServiceError } from '../server/index.js';
import { createAISSEStreamResponse } from '../server/route/utils.js';
import { AIConversationService } from '../server/service/ai-conversation-service.js';
import { ResourceActionError } from '../server/types.js';

function serviceWhoseAgentCannotStart(error: unknown) {
  return new AIConversationService({
    ai: {} as never,
    database: {} as never,
    databaseManager: {} as never,
    logger: { error: vi.fn() } as never,
    caching: {} as never,
    fileStorage: {} as never,
    snowflake: {} as never,
    repositories: {
      aiConversations: { count: vi.fn().mockResolvedValue(0), update: vi.fn() },
      aiEmployees: {
        findOne: vi
          .fn()
          .mockResolvedValue({ username: 'order-desk', enabled: true }),
      },
      aiMessages: {
        findOne: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          messageId: 'message-1',
          toolCalls: [{ id: 'call-1', name: 'lookup', args: {} }],
        }),
      },
    } as never,
    aiEmployeesManager: {} as never,
    aiConversationsManager: {
      getConversation: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        title: 'Existing conversation',
        aiEmployeeUsername: 'order-desk',
        category: 'chat',
        options: {},
      }),
      getUserDecisions: vi.fn().mockResolvedValue([]),
    } as never,
    builtInManager: {} as never,
    llmStreamCachedManager: {} as never,
    subAgentsDispatcher: {
      isInterrupted: vi.fn().mockResolvedValue(false),
    } as never,
    knowledgeBaseManager: {} as never,
    workContextHandler: {} as never,
    documentLoaders: {} as never,
    agentServiceFactory: {
      createAIEmployee: vi.fn().mockRejectedValue(error),
    } as never,
  });
}

const request = (stream: boolean, streamTarget?: unknown) => ({
  actor: { id: 'user-1', roles: ['member'], isRoot: false },
  aiEmployee: 'order-desk',
  messages: [
    {
      role: 'user' as const,
      content: { type: 'text' as const, content: 'Hi' },
    },
  ],
  stream,
  state: { sessionId: 'session-1' },
  transport: { translate: (key: string) => key, streamTarget } as never,
});

const noModel = new AgentServiceError(
  'CONFIGURATION_ERROR',
  'AI employee model not configured',
);

describe('agent failures reported over SSE', () => {
  it('names the failure code in the error event of a streamed turn', async () => {
    const writes: string[] = [];
    const target = {
      write: (chunk: unknown) => writes.push(String(chunk)),
      end: vi.fn(),
      writableEnded: false,
    };

    await serviceWhoseAgentCannotStart(noModel).sendMessages(
      request(true, target),
    );

    expect(writes.join('')).toContain('"type":"error"');
    expect(writes.join('')).toContain('"code":"CONFIGURATION_ERROR"');
    expect(writes.join('')).toContain('AI employee model not configured');
  });

  it('names the failure code, and the root message, when a resumed tool call fails', async () => {
    const writes: string[] = [];
    const target = {
      write: (chunk: unknown) => writes.push(String(chunk)),
      end: vi.fn(),
      writableEnded: false,
    };
    const failure = new AgentServiceError(
      'PROVIDER_ERROR',
      'Agent execution failed',
      { cause: new Error('Provider rejected the request') },
    );

    await serviceWhoseAgentCannotStart(failure).resumeToolCall({
      actor: { id: 'user-1', roles: ['member'], isRoot: false },
      state: { sessionId: 'session-1' },
      transport: {
        translate: (key: string) => key,
        streamTarget: target,
      } as never,
    });

    expect(writes.join('')).toContain('"type":"error"');
    expect(writes.join('')).toContain('"code":"PROVIDER_ERROR"');
    expect(writes.join('')).toContain('Provider rejected the request');
  });

  it('keeps the agent failure on the error a non-streamed turn throws', async () => {
    const thrown = await serviceWhoseAgentCannotStart(noModel)
      .sendMessages(request(false))
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ResourceActionError);
    expect((thrown as ResourceActionError).cause).toBe(noModel);
  });

  it('answers 200 over SSE and puts the code in the error event', async () => {
    const app = new Hono();
    app.post('/send', (context) =>
      createAISSEStreamResponse(context, 'send', () => {
        throw new ResourceActionError(503, noModel.message, { cause: noModel });
      }),
    );

    const response = await app.request('/send', { method: 'POST' });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"code":"CONFIGURATION_ERROR"');
    expect(body).toContain('AI employee model not configured');
  });
});
