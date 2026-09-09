import { describe, expect, it, vi } from 'vitest';
import type { AIMessageInput } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/agent-service.js';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from '../server/agent/providers.js';
import type { AgentProviders } from '../server/agent/types.js';

const createProviders = (
  cancel: AgentProviders['conversation']['toolCalls']['cancel'],
) => {
  const conversation = createMemoryConversationProvider();
  conversation.toolCalls.cancel = cancel;
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
    getExecutionConfig: vi.fn(),
    shouldInterruptToolCall: vi.fn(),
    getToolsMap: vi.fn(),
  };
  const providers: AgentProviders = {
    conversation,
    chatContext,
    chatMessageConverters: {
      formatMessages: vi.fn(),
      assistant: { toStored: vi.fn() },
      human: { toStored: vi.fn() },
      tool: { toStored: vi.fn() },
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
  expect(chatContext.getExecutionConfig).not.toHaveBeenCalled();
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

  it('uses the final cancel override instead of the base provider', async () => {
    const baseCancel = vi.fn(async () => undefined);
    const overriddenMessages: AIMessageInput[] = [
      {
        role: 'tool',
        content: { type: 'text', content: 'Overridden' },
        metadata: { toolCallId: 'call-override' },
      },
    ];
    const overriddenCancel = vi.fn(async () => overriddenMessages);
    const base = createProviders(baseCancel);
    const finalProviders = createAgentProviders({
      conversation: base.providers.conversation,
      chatContext: base.providers.chatContext,
      chatMessageConverters: base.providers.chatMessageConverters,
      features: base.providers.features,
      overrides: { conversation: { toolCalls: { cancel: overriddenCancel } } },
    });
    const service = new AgentService(finalProviders);

    await expect(service.cancelToolCall()).resolves.toBe(overriddenMessages);
    expect(overriddenCancel).toHaveBeenCalledOnce();
    expect(baseCancel).not.toHaveBeenCalled();
    expectNoExecutionLifecycle(base.chatContext, base.lifecycle);
  });

  it('propagates errors from the final cancel override', async () => {
    const baseCancel = vi.fn(async () => undefined);
    const error = new Error('override cancel failed');
    const overriddenCancel = vi.fn(async () => {
      throw error;
    });
    const base = createProviders(baseCancel);
    const finalProviders = createAgentProviders({
      conversation: base.providers.conversation,
      chatContext: base.providers.chatContext,
      chatMessageConverters: base.providers.chatMessageConverters,
      features: base.providers.features,
      overrides: { conversation: { toolCalls: { cancel: overriddenCancel } } },
    });
    const service = new AgentService(finalProviders);

    await expect(service.cancelToolCall()).rejects.toBe(error);
    expect(overriddenCancel).toHaveBeenCalledOnce();
    expect(baseCancel).not.toHaveBeenCalled();
    expectNoExecutionLifecycle(base.chatContext, base.lifecycle);
  });
});
