import { describe, expect, it, vi } from 'vitest';
import type { AIMessageInput } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/agent-service.js';
import { createAIEmployeeAgentService } from '../server/agent/ai-employee/index.js';
import { createMemoryConversationProvider } from '../server/agent/providers.js';
import type { AgentProviders } from '../server/agent/types.js';

const createProviders = (
  cancel: AgentProviders['conversation']['messages']['cancelToolCall'],
) => {
  const conversation = createMemoryConversationProvider();
  conversation.messages.cancelToolCall = cancel;
  const lifecycle = {
    beforeExecution: vi.spyOn(conversation, 'beforeExecution'),
    afterExecution: vi.spyOn(conversation, 'afterExecution'),
    registerAbortHandle: vi.spyOn(conversation, 'registerAbortHandle'),
    unregisterAbortHandle: vi.spyOn(conversation, 'unregisterAbortHandle'),
  };
  const chatContext = {
    resolveLLM: vi.fn(),
    getSystemPrompt: vi.fn(),
    discoveredTools: vi.fn(),
    activeTools: vi.fn(),
  };
  const providers: AgentProviders = {
    conversation,
    logger: { warn: vi.fn(), error: vi.fn() } as never,
    chatContext,
    chatMessageConverters: {
      formatMessages: vi.fn(),
      assistant: { convert: vi.fn() },
      human: { convert: vi.fn() },
      tool: { convert: vi.fn() },
    },
    features: {
      contextEnrichment: true,
      skills: true,
      tools: true,
      toolInteraction: true,
      toolCallStatus: true,
      conversationPersistence: true,
      toolCallSanitizer: true,
      knowledgeBase: true,
      subAgents: true,
    },
  };
  return { providers, chatContext, lifecycle };
};

const expectNoExecutionLifecycle = (
  chatContext: ReturnType<typeof createProviders>['chatContext'],
  lifecycle: ReturnType<typeof createProviders>['lifecycle'],
) => {
  expect(chatContext.resolveLLM).not.toHaveBeenCalled();
  expect(chatContext.getSystemPrompt).not.toHaveBeenCalled();
  expect(chatContext.discoveredTools).not.toHaveBeenCalled();
  expect(chatContext.activeTools).not.toHaveBeenCalled();
  expect(lifecycle.beforeExecution).not.toHaveBeenCalled();
  expect(lifecycle.afterExecution).not.toHaveBeenCalled();
  expect(lifecycle.registerAbortHandle).not.toHaveBeenCalled();
  expect(lifecycle.unregisterAbortHandle).not.toHaveBeenCalled();
};

describe('AgentService tool-call cancellation', () => {
  it('returns the final conversation provider result without execution lifecycle work', async () => {
    const cancelledMessages: AIMessageInput[] = [
      {
        role: 'tool',
        content: { type: 'text', content: 'Cancelled' },
        metadata: { toolCallId: 'call-1' },
      },
    ];
    const cancel = vi.fn(async () => cancelledMessages);
    const { providers, chatContext, lifecycle } = createProviders(cancel);
    const service = new AgentService(providers);

    await expect(service.cancelToolCall()).resolves.toBe(cancelledMessages);
    expect(cancel).toHaveBeenCalledOnce();
    expectNoExecutionLifecycle(chatContext, lifecycle);
  });

  it('preserves an undefined provider result', async () => {
    const cancel = vi.fn(async () => undefined);
    const { providers, chatContext, lifecycle } = createProviders(cancel);
    const service = new AgentService(providers);

    await expect(service.cancelToolCall()).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expectNoExecutionLifecycle(chatContext, lifecycle);
  });

  it('propagates provider errors without wrapping them', async () => {
    const error = new Error('cancel failed');
    const cancel = vi.fn(async () => {
      throw error;
    });
    const { providers, chatContext, lifecycle } = createProviders(cancel);
    const service = new AgentService(providers);

    await expect(service.cancelToolCall()).rejects.toBe(error);
    expect(cancel).toHaveBeenCalledOnce();
    expectNoExecutionLifecycle(chatContext, lifecycle);
  });

  it('returns one AgentService from the AI employee factory', async () => {
    const options = {
      sessionId: 'session-1',
      employee: { username: 'dara' },
      agentContext: { logger: {}, ai: {} },
      builtInManager: { setupBuiltInInfo: vi.fn() },
      database: {},
      collectionRepository: vi.fn(),
      aiConversations: { update: vi.fn() },
      aiEmployees: {},
      aiMessages: {},
      aiToolMessages: {},
      usersAiEmployees: {},
      lcCheckpoints: {},
      lcCheckpointBlobs: {},
      lcCheckpointWrites: {},
      snowflake: {},
      llmStreamCachedManager: {
        getCached: () => ({
          append: vi.fn(),
          clear: vi.fn(),
          skipped: vi.fn(),
        }),
      },
    } as any;

    const agent = await createAIEmployeeAgentService(options);

    expect(agent).toBeInstanceOf(AgentService);
    expect(typeof agent.invoke).toBe('function');
    expect(typeof agent.stream).toBe('function');
    expect(typeof agent.cancelToolCall).toBe('function');
    expect(agent).not.toHaveProperty('service');
    expect(agent).not.toHaveProperty('facade');
  });
});
