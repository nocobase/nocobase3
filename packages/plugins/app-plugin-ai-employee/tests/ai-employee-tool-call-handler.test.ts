import { describe, expect, it, vi } from 'vitest';

import { createAIEmployeeConversationProvider } from '../server/agent/ai-employee/providers.js';
import { AIEmployeeToolCallHandler } from '../server/agent/ai-employee/tool-call-handler.js';

function createFixture(overrides: Record<string, unknown> = {}) {
  const transaction = { id: 'transaction-1' };
  const aiToolMessages = {
    create: vi.fn(async ({ values }) => values),
    update: vi.fn(async () => 1),
    findOne: vi.fn(async () => null),
    find: vi.fn(async () => []),
  };
  const aiMessages = {
    create: vi.fn(async ({ values }) =>
      values.map((value, index) => ({
        ...value,
        messageId: value.messageId ?? `message-${index + 1}`,
        sessionId: value.sessionId ?? 'session-1',
      })),
    ),
    update: vi.fn(async () => 1),
    findOne: vi.fn(async () => null),
    find: vi.fn(async () => []),
    destroy: vi.fn(async () => 0),
  };
  const repositories = {
    aiToolMessages,
    aiMessages,
    aiConversations: {
      update: vi.fn(async () => 1),
      findOne: vi.fn(async () => ({ sessionId: 'session-1', thread: 0 })),
    },
  };
  const database = {
    transaction: vi.fn(async (callback) => callback(transaction)),
  };
  const policy = {
    getToolsMap: vi.fn(
      async () =>
        new Map([
          [
            'knownTool',
            {
              definition: { name: 'knownTool' },
              execution: 'frontend',
            },
          ],
        ]),
    ),
    isAutoCall: vi.fn(async () => true),
    shouldInterruptToolCall: vi.fn(() => false),
  };
  const handler = new AIEmployeeToolCallHandler({
    sessionId: 'session-1',
    database,
    messages: aiMessages,
    toolMessages: aiToolMessages,
    snowflake: { generate: vi.fn(() => 101) },
    policy,
    ...overrides,
  } as never);
  return {
    transaction,
    aiToolMessages,
    aiMessages,
    repositories,
    database,
    policy,
    handler,
  };
}

describe('AIEmployeeToolCallHandler', () => {
  it('initializes known and missing tools with the shared policy', async () => {
    const fixture = createFixture();

    const result = await fixture.handler.initialize('message-1', [
      { id: 'call-1', name: 'knownTool', args: { value: 1 } },
      { id: 'call-2', name: 'missingTool', args: { value: 2 } },
    ]);

    expect(fixture.database.transaction).toHaveBeenCalledOnce();
    expect(fixture.policy.getToolsMap).toHaveBeenCalledOnce();
    expect(fixture.policy.isAutoCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ definition: { name: 'knownTool' } }),
      { value: 1 },
    );
    expect(fixture.policy.isAutoCall).toHaveBeenNthCalledWith(2, undefined, {
      value: 2,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 101,
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'call-1',
        invokeStatus: 'init',
        execution: 'frontend',
        auto: true,
      }),
      expect.objectContaining({
        toolCallId: 'call-2',
        status: 'error',
        content: 'Tool missingTool not found',
        invokeStatus: 'done',
        execution: 'backend',
      }),
    ]);
    expect(result[1].invokeStartTime).toBeInstanceOf(Date);
    expect(result[1].invokeEndTime).toBe(result[1].invokeStartTime);
    expect(fixture.aiToolMessages.create).toHaveBeenCalledWith(
      expect.anything(),
      { connection: fixture.transaction },
    );
  });

  it('uses an explicit connection without opening a transaction', async () => {
    const fixture = createFixture();
    const connection = { id: 'caller-transaction' };

    await fixture.handler.initializeInTransaction(
      connection as never,
      'message-1',
      [{ id: 'call-1', name: 'knownTool', args: {} }],
    );
    await fixture.handler.confirmInTransaction(
      connection as never,
      'message-1',
      ['call-1'],
    );

    expect(fixture.database.transaction).not.toHaveBeenCalled();
    expect(fixture.aiToolMessages.create).toHaveBeenCalledWith(
      expect.anything(),
      { connection },
    );
    expect(fixture.aiToolMessages.update).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          sessionId: 'session-1',
          messageId: 'message-1',
          toolCallId: { $in: ['call-1'] },
        },
      }),
      { connection },
    );
  });

  it('moves init or waiting calls to pending within the current session', async () => {
    const fixture = createFixture();

    await expect(
      fixture.handler.markPending('message-1', 'call-1'),
    ).resolves.toBe(1);

    expect(fixture.aiToolMessages.update).toHaveBeenCalledWith({
      values: {
        invokeStatus: 'pending',
        invokeStartTime: expect.any(Date),
      },
      filter: {
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'call-1',
        invokeStatus: { $in: ['init', 'waiting'] },
      },
    });
  });

  it('normalizes success and error results while preserving the pending CAS', async () => {
    const fixture = createFixture();

    await fixture.handler.markDone('message-1', 'call-1', {
      status: 'warning',
      content: { value: 1 },
    });
    await fixture.handler.markError('message-1', 'call-2', new Error('failed'));

    expect(fixture.aiToolMessages.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        values: expect.objectContaining({
          invokeStatus: 'done',
          status: 'warning',
          content: { value: 1 },
        }),
        filter: {
          sessionId: 'session-1',
          messageId: 'message-1',
          toolCallId: 'call-1',
          invokeStatus: 'pending',
        },
      }),
    );
    expect(fixture.aiToolMessages.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        values: expect.objectContaining({
          status: 'error',
          content: 'failed',
        }),
      }),
    );
  });

  it('updates interrupt metadata in one transaction only after the CAS succeeds', async () => {
    const fixture = createFixture();
    fixture.aiMessages.findOne.mockResolvedValue({
      metadata: { existing: true },
    });

    await expect(
      fixture.handler.markInterrupted(
        'sub-session',
        'message-1',
        'call-1',
        'interrupt-1',
        { order: 3, description: 'Review' },
      ),
    ).resolves.toBe(1);

    expect(fixture.aiToolMessages.update).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          sessionId: 'sub-session',
          messageId: 'message-1',
          toolCallId: 'call-1',
          invokeStatus: 'init',
        },
      }),
      { connection: fixture.transaction },
    );
    expect(fixture.aiMessages.update).toHaveBeenCalledWith(
      {
        values: { metadata: { existing: true, interruptId: 'interrupt-1' } },
        filter: { messageId: 'message-1', sessionId: 'sub-session' },
      },
      { connection: fixture.transaction },
    );

    fixture.aiToolMessages.update.mockResolvedValueOnce(0);
    fixture.aiMessages.update.mockClear();
    await expect(
      fixture.handler.markInterrupted(
        'sub-session',
        'message-1',
        'call-1',
        'interrupt-2',
        { order: 4 },
      ),
    ).resolves.toBe(0);
    expect(fixture.aiMessages.update).not.toHaveBeenCalled();
  });

  it('confirms and queries only records owned by the handler session', async () => {
    const fixture = createFixture();
    fixture.aiToolMessages.findOne.mockResolvedValue({
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'call-1',
    });
    fixture.aiToolMessages.find.mockResolvedValue([
      { toolCallId: 'call-1', content: 'one' },
      { content: 'invalid' },
    ]);

    await fixture.handler.confirm('message-1', ['call-1']);
    await fixture.handler.get('message-1', 'call-1');
    const result = await fixture.handler.getMany('message-1', [
      'call-1',
      'call-2',
    ]);

    expect(fixture.aiToolMessages.findOne).toHaveBeenCalledWith({
      filter: {
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'call-1',
      },
    });
    expect(fixture.aiToolMessages.find).toHaveBeenCalledWith({
      filter: {
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: { $in: ['call-1', 'call-2'] },
      },
    });
    expect(result).toEqual(
      new Map([['call-1', expect.objectContaining({ content: 'one' })]]),
    );
  });

  it('cancels pending calls within the session and inherits source metadata', async () => {
    const fixture = createFixture();
    const sourceMessage = {
      messageId: 'message-1',
      sessionId: 'session-1',
      role: 'dara',
      content: { type: 'text', content: 'calling' },
      toolCalls: [
        { id: 'call-1', name: 'knownTool', type: 'tool_call', args: {} },
      ],
      metadata: {
        model: 'source-model',
        provider: 'source-provider',
        llmService: 'source-service',
        response_metadata: { ignored: true },
      },
    };
    const pendingToolMessage = {
      id: 'tool-message-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      toolCallId: 'call-1',
      invokeStatus: 'pending',
      auto: false,
    };
    const createdMessages = [
      {
        messageId: 'continuation-1',
        sessionId: 'session-1',
        role: 'tool',
        content: { type: 'text', content: expect.any(String) },
      },
    ];
    fixture.aiMessages.find.mockResolvedValue([sourceMessage]);
    fixture.aiToolMessages.find.mockResolvedValue([pendingToolMessage]);
    fixture.aiMessages.create.mockResolvedValue(createdMessages);

    await expect(fixture.handler.cancel()).resolves.toBe(createdMessages);

    expect(fixture.aiMessages.find).toHaveBeenCalledWith({
      filter: { sessionId: 'session-1' },
      sort: ['-messageId'],
    });
    expect(fixture.aiToolMessages.find).toHaveBeenCalledWith({
      filter: {
        sessionId: 'session-1',
        messageId: 'message-1',
        invokeStatus: { $ne: 'confirmed' },
      },
    });
    expect(fixture.aiToolMessages.update).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          id: 'tool-message-1',
          sessionId: 'session-1',
          invokeStatus: 'pending',
        },
      }),
      { connection: fixture.transaction },
    );
    expect(fixture.aiMessages.create).toHaveBeenCalledWith(
      {
        values: [
          expect.objectContaining({
            sessionId: 'session-1',
            role: 'tool',
            metadata: {
              model: 'source-model',
              provider: 'source-provider',
              llmService: 'source-service',
              toolCall: sourceMessage.toolCalls[0],
              toolCallId: 'call-1',
              sourceMessageId: 'message-1',
              autoCall: false,
            },
          }),
        ],
      },
      { connection: fixture.transaction },
    );
  });

  it('returns undefined without opening a transaction when no call is pending', async () => {
    const fixture = createFixture();
    fixture.aiMessages.find.mockResolvedValue([
      {
        messageId: 'message-1',
        sessionId: 'session-1',
        toolCalls: [{ id: 'call-1', name: 'knownTool', args: {} }],
      },
    ]);

    await expect(fixture.handler.cancel()).resolves.toBeUndefined();

    expect(fixture.database.transaction).not.toHaveBeenCalled();
    expect(fixture.aiMessages.create).not.toHaveBeenCalled();
    expect(fixture.aiToolMessages.update).not.toHaveBeenCalled();
  });

  it('uses reject reason for the merged cancellation flow', async () => {
    const fixture = createFixture();
    fixture.aiMessages.find.mockResolvedValue([
      {
        messageId: 'message-1',
        sessionId: 'session-1',
        toolCalls: [
          { id: 'call-1', name: 'knownTool', type: 'tool_call', args: {} },
        ],
      },
    ]);
    fixture.aiToolMessages.find.mockResolvedValue([
      {
        id: 'tool-message-1',
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'call-1',
        invokeStatus: 'waiting',
      },
    ]);

    await expect(
      fixture.handler.reject('message-1', ['call-1'], 'Rejected'),
    ).resolves.toBe(1);

    expect(fixture.aiToolMessages.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ content: 'Rejected' }),
      }),
      { connection: fixture.transaction },
    );
  });
});

describe('AI employee conversation transaction wiring', () => {
  it('shares the message transaction with initialize, confirm, and thread updates', async () => {
    const fixture = createFixture();
    const handler = fixture.handler;
    const initialize = vi.spyOn(handler, 'initializeInTransaction');
    const confirm = vi.spyOn(handler, 'confirmInTransaction');
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      database: fixture.database,
      repositories: fixture.repositories,
      snowflake: { generate: vi.fn(() => 201) },
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as never;
    const conversation = createAIEmployeeConversationProvider(options, handler);

    await conversation.messages.saveAssistantMessage(
      { role: 'dara', content: { type: 'text', content: 'answer' } },
      [{ id: 'call-1', name: 'knownTool', args: {} }],
    );
    await conversation.messages.saveToolMessages(
      [{ role: 'tool', content: { type: 'text', content: 'result' } }],
      'message-1',
      ['call-1'],
    );
    await conversation.messages.saveUserMessages(
      undefined,
      [{ role: 'user', content: { type: 'text', content: 'next' } }],
      { sessionId: 'session-1', thread: 2, threadId: 'session-1:2' },
    );

    expect(initialize).toHaveBeenCalledWith(
      fixture.transaction,
      expect.any(String),
      expect.any(Array),
    );
    expect(confirm).toHaveBeenCalledWith(fixture.transaction, 'message-1', [
      'call-1',
    ]);
    expect(fixture.repositories.aiConversations.update).toHaveBeenCalledWith(
      {
        values: { thread: 2 },
        filter: { sessionId: 'session-1', thread: { $lt: 2 } },
      },
      { connection: fixture.transaction },
    );

    await conversation.threads.update({
      sessionId: 'session-1',
      thread: 3,
      threadId: 'session-1:3',
    });
    expect(
      fixture.repositories.aiConversations.update,
    ).toHaveBeenLastCalledWith(
      {
        values: { thread: 3 },
        filter: { sessionId: 'session-1', thread: { $lt: 3 } },
      },
      undefined,
    );
  });

  it('propagates handler failures through the message transaction callback', async () => {
    const fixture = createFixture();
    vi.spyOn(fixture.handler, 'initializeInTransaction').mockRejectedValue(
      new Error('initialize failed'),
    );
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      database: fixture.database,
      repositories: fixture.repositories,
      snowflake: { generate: vi.fn(() => 201) },
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as never;
    const conversation = createAIEmployeeConversationProvider(
      options,
      fixture.handler,
    );

    await expect(
      conversation.messages.saveAssistantMessage(
        { role: 'dara', content: { type: 'text', content: 'answer' } },
        [{ id: 'call-1', name: 'knownTool', args: {} }],
      ),
    ).rejects.toThrow('initialize failed');
  });
});
