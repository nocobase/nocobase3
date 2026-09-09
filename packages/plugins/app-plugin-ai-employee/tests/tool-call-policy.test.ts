import { describe, expect, it, vi } from 'vitest';
import { createAIEmployeeConversationProvider } from '../server/agent/ai-employee/providers.js';
import { AIEmployeeToolCallCancellation } from '../server/agent/ai-employee/tool-call-cancellation.js';

const tool = (permission: 'ALLOW' | 'DENY' = 'ALLOW') =>
  ({
    definition: { name: 'customTool' },
    defaultPermission: permission,
    execution: 'backend',
  }) as any;

describe('AIEmployeeToolCallCancellation', () => {
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
    const cancellation = new AIEmployeeToolCallCancellation({
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

    await expect(cancellation.cancel('Cancelled')).resolves.toBe(
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
    const cancellation = new AIEmployeeToolCallCancellation({
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

    await expect(cancellation.cancel()).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(getLLMService).not.toHaveBeenCalled();
  });
});
