import { describe, expect, it, vi } from 'vitest';
import { createAIEmployeeConversationProvider } from '../server/agent/ai-employee/providers.js';
import { AIEmployeeCapabilities } from '../server/agent/ai-employee/runtime.js';

const tool = (permission: 'ALLOW' | 'DENY' = 'ALLOW') =>
  ({
    definition: { name: 'customTool' },
    defaultPermission: permission,
    execution: 'backend',
  }) as any;

describe('AI employee ToolCallPolicy injection', () => {
  it('uses one policy for persisted auto and tool availability', async () => {
    const create = vi.fn(async ({ values }) => values);
    const policy = {
      getToolsMap: vi.fn(async () => new Map([['customTool', tool()]])),
      isAutoCall: vi.fn(async () => true),
      shouldInterruptToolCall: vi.fn(() => false),
    };
    const runtime = {
      initToolCall: vi.fn(() => {
        throw new Error('legacy policy must not be used');
      }),
    };
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      database: { transaction: (callback) => callback({}) },
      repositories: {
        aiToolMessages: { create },
      },
      snowflake: { generate: () => 1 },
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as any;
    const state = { options, runtime } as any;
    const conversation = createAIEmployeeConversationProvider(
      options,
      state,
      policy,
    );

    const [stored] = await conversation.toolCalls.initialize('message-1', [
      { id: 'call-1', name: 'customTool', args: { value: 1 } },
    ]);

    expect(policy.getToolsMap).toHaveBeenCalledOnce();
    expect(policy.isAutoCall).toHaveBeenCalledWith(
      expect.objectContaining({ definition: { name: 'customTool' } }),
      { value: 1 },
    );
    expect(stored).toMatchObject({
      toolName: 'customTool',
      auto: true,
      invokeStatus: 'init',
      execution: 'backend',
    });
    expect(runtime.initToolCall).not.toHaveBeenCalled();
  });

  it('returns cancelled tool messages from the AI employee runtime', async () => {
    const cancelledMessages = [
      {
        role: 'tool',
        content: { type: 'text', content: 'Ignored' },
        metadata: {
          sourceMessageId: 'message-1',
          toolCallId: 'call-1',
          toolCall: { id: 'call-1', name: 'customTool', args: {} },
        },
      },
    ];
    const cancelToolCall = vi.fn(async () => cancelledMessages);
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      database: {},
      repositories: {},
      snowflake: {},
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as any;
    const conversation = createAIEmployeeConversationProvider(
      options,
      { options, runtime: { cancelToolCall } } as any,
      {} as any,
    );

    await expect(conversation.toolCalls.cancel()).resolves.toBe(
      cancelledMessages,
    );
    expect(cancelToolCall).toHaveBeenCalledOnce();
    expect(cancelledMessages[0]).toMatchObject({
      role: 'tool',
      metadata: {
        sourceMessageId: 'message-1',
        toolCallId: 'call-1',
        toolCall: { id: 'call-1', name: 'customTool' },
      },
    });
  });

  it('preserves undefined when the runtime has no pending tool calls', async () => {
    const cancelToolCall = vi.fn(async () => undefined);
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      database: {},
      repositories: {},
      snowflake: {},
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as any;
    const conversation = createAIEmployeeConversationProvider(
      options,
      { options, runtime: { cancelToolCall } } as any,
      {} as any,
    );

    await expect(conversation.toolCalls.cancel()).resolves.toBeUndefined();
    expect(cancelToolCall).toHaveBeenCalledOnce();
  });
});

describe('AIEmployeeCapabilities tool-call cancellation', () => {
  it('updates persisted tool-call state and returns created continuation messages', async () => {
    const update = vi.fn(async () => 1);
    const createdMessages = [
      {
        messageId: 'continuation-1',
        sessionId: 'session-1',
        role: 'tool',
        content: { type: 'text', content: 'Cancelled' },
        metadata: {
          sourceMessageId: 'message-1',
          toolCallId: 'call-1',
          toolCall: { id: 'call-1', name: 'customTool', args: {} },
        },
      },
    ];
    const create = vi.fn(async () => createdMessages);
    const runtime = new AIEmployeeCapabilities({
      agentContext: {
        ai: {
          llmProviderManager: {
            getLLMService: vi.fn(async () => ({
              model: 'test-model',
              service: { provider: 'test-provider' },
            })),
          },
        },
        logger: {},
      },
      database: { transaction: (callback) => callback({ id: 'transaction' }) },
      snowflake: { generate: () => 'continuation-1' },
      repositories: {
        aiMessages: {
          find: vi.fn(async () => [
            {
              messageId: 'message-1',
              toolCalls: [{ id: 'call-1', name: 'customTool', args: {} }],
            },
          ]),
          create,
          findOne: vi.fn(async () => ({
            toolCalls: [
              {
                id: 'call-1',
                name: 'customTool',
                args: {},
                type: 'tool_call',
              },
            ],
          })),
        },
        aiToolMessages: {
          find: vi.fn(async () => [
            {
              id: 'tool-message-1',
              messageId: 'message-1',
              toolCallId: 'call-1',
              toolName: 'customTool',
              invokeStatus: 'pending',
              auto: false,
            },
          ]),
          update,
        },
      },
      sessionId: 'session-1',
      model: {
        provider: 'test-provider',
        llmService: 'test',
        model: 'test-model',
      },
    } as any);

    await expect(runtime.cancelToolCall('Cancelled')).resolves.toBe(
      createdMessages,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          invokeStatus: 'confirmed',
          status: 'success',
          content: 'Cancelled',
        }),
        filter: expect.objectContaining({
          id: 'tool-message-1',
          invokeStatus: 'pending',
        }),
      }),
      { connection: { id: 'transaction' } },
    );
    expect(create).toHaveBeenCalledWith(
      {
        values: [
          expect.objectContaining({
            role: 'tool',
            content: { type: 'text', content: 'Cancelled' },
            metadata: expect.objectContaining({
              sourceMessageId: 'message-1',
              toolCallId: 'call-1',
              toolCall: expect.objectContaining({
                id: 'call-1',
                name: 'customTool',
                args: {},
              }),
            }),
          }),
        ],
      },
      { connection: { id: 'transaction' } },
    );
  });

  it('returns undefined without persistence work when no tool call is pending', async () => {
    const update = vi.fn();
    const create = vi.fn();
    const getLLMService = vi.fn();
    const runtime = new AIEmployeeCapabilities({
      agentContext: {
        ai: { llmProviderManager: { getLLMService } },
        logger: {},
      },
      database: { transaction: vi.fn() },
      snowflake: { generate: vi.fn() },
      repositories: {
        aiMessages: {
          find: vi.fn(async () => [
            { messageId: 'message-1', toolCalls: [{ id: 'call-1' }] },
          ]),
          create,
        },
        aiToolMessages: { find: vi.fn(async () => []), update },
      },
      sessionId: 'session-1',
      model: {
        provider: 'test-provider',
        llmService: 'test',
        model: 'test-model',
      },
    } as any);

    await expect(runtime.cancelToolCall()).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(getLLMService).not.toHaveBeenCalled();
  });
});
