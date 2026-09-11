import { describe, expect, it, vi } from 'vitest';
import type { AIMessageInput } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/service/agent-service.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import type { AgentProviders } from '../server/agent/types.js';

const createProviders = (
  cancel: AgentProviders['conversation']['messages']['cancelToolCall'],
) => {
  const conversation = createTestConversationProvider();
  conversation.messages.cancelToolCall = cancel;
  const lifecycle = {
    beforeExecution: vi.spyOn(conversation.event, 'beforeExecution'),
    afterExecution: vi.spyOn(conversation.event, 'afterExecution'),
    registerAbortHandle: vi.spyOn(conversation.abort, 'registerAbortHandle'),
    unregisterAbortHandle: vi.spyOn(
      conversation.abort,
      'unregisterAbortHandle',
    ),
  };
  const chatContext = {
    resolveLLM: vi.fn(),
    getSystemPrompt: vi.fn(),
    currentConversation: vi.fn(() => ({ sessionId: 'test-session' })),
    discoveredTools: vi.fn(),
  };
  const providers: AgentProviders = {
    conversation,
    logger: { warn: vi.fn(), error: vi.fn() } as never,
    chatContext,
    converters: {
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
});
