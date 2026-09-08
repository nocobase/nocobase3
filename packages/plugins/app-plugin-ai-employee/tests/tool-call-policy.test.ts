import { describe, expect, it, vi } from 'vitest';
import { createAIEmployeeConversationProvider } from '../server/agent/ai-employee/providers.js';

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
});
