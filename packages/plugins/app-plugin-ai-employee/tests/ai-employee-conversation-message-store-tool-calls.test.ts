import { describe, expect, it, vi } from 'vitest';

import { DefaultConversationMessageStore } from '../server/agent/conversation/message-store.js';

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
  const database = {
    transaction: vi.fn(async (callback) => callback(transaction)),
  };
  const store = new DefaultConversationMessageStore({
    sessionId: (overrides.sessionId as string | undefined) ?? 'session-1',
    conversation: {},
    database: (overrides.database as typeof database | undefined) ?? database,
    messages:
      (overrides.messages as typeof aiMessages | undefined) ?? aiMessages,
    toolMessages:
      (overrides.toolMessages as typeof aiToolMessages | undefined) ??
      aiToolMessages,
    snowflake: (overrides.snowflake as { generate(): number } | undefined) ?? {
      generate: vi.fn(() => 101),
    },
    getCurrentFrontendTools:
      (overrides.getCurrentFrontendTools as
        (() => Promise<never[]>) | undefined) ?? vi.fn(async () => []),
  } as never);
  return {
    transaction,
    aiToolMessages,
    aiMessages,
    database,
    store,
  };
}

describe('DefaultConversationMessageStore tool calls', () => {
  it('moves init or waiting calls to pending within the current session', async () => {
    const fixture = createFixture();

    await expect(
      fixture.store.updateToolPending('message-1', 'call-1'),
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

    await fixture.store.updateToolDone('message-1', 'call-1', {
      status: 'warning',
      content: { value: 1 },
    });
    await fixture.store.updateToolError(
      'message-1',
      'call-2',
      new Error('failed'),
    );

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
      fixture.store.updateToolInterrupted(
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
      fixture.store.updateToolInterrupted(
        'sub-session',
        'message-1',
        'call-1',
        'interrupt-2',
        { order: 4 },
      ),
    ).resolves.toBe(0);
    expect(fixture.aiMessages.update).not.toHaveBeenCalled();
  });

  it('queries only records owned by the handler session', async () => {
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

    await fixture.store.getToolCallResult('message-1', 'call-1');
    const result = await fixture.store.listToolCallResult('message-1', [
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

    await expect(fixture.store.cancelToolCall()).resolves.toBe(createdMessages);

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

    await expect(fixture.store.cancelToolCall()).resolves.toBeUndefined();

    expect(fixture.database.transaction).not.toHaveBeenCalled();
    expect(fixture.aiMessages.create).not.toHaveBeenCalled();
    expect(fixture.aiToolMessages.update).not.toHaveBeenCalled();
  });
});
