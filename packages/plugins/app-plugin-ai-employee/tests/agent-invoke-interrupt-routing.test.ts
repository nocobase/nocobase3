import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { createAgentService } from '../server/agent/service/agent-service.js';
import { createAgentProviders } from '../server/agent/providers.js';
import { DefaultChatMessageConverters } from '../server/agent/message/converters.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import type { AgentContextProvider } from '../server/agent/types.js';

const graph = vi.hoisted(() => ({
  invoke: vi.fn<(input: unknown, config: any) => Promise<unknown>>(),
}));

// What a root graph returns when a sub-agent running inside one of its tools
// paused: the sub-agent reported its saved message through the writer, and the
// interrupt names the sub-agent's conversation rather than this one.
vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return {
    ...actual,
    createAgent: () => ({ invoke: graph.invoke }),
  };
});

const provider = {
  createModel: () => ({}),
  resolveTools: () => [],
  prepareStoredAssistantAdditionalKwargs: (
    additionalKwargs?: Record<string, unknown>,
  ) => additionalKwargs,
} as never;

const agentFor = (sessionId: string) => {
  const conversation = createTestConversationProvider({ sessionId });
  const context: AgentContextProvider = {
    currentConversation: () => ({ sessionId }),
    agentContext: { state: { sessionId } } as never,
    resolveLLM: async () => ({
      providerName: 'test',
      llmService: 'test-service',
      model: 'test-model',
      provider,
    }),
    getSystemPrompt: async () => undefined,
    discoveredTools: async () => ({
      tools: new Map(),
      activeTools: async () => new Set<string>(),
    }),
  };
  const service = createAgentService(
    createAgentProviders({
      conversation,
      context,
      converters: new DefaultChatMessageConverters(),
    }),
  );
  const updateToolInterrupted = vi.spyOn(
    conversation.messages,
    'updateToolInterrupted',
  );
  return { service, updateToolInterrupted };
};

const action = (sessionId: string, toolCallId: string) => ({
  name: 'reviewed-tool',
  args: {},
  description: JSON.stringify({
    sessionId,
    toolCallId,
    toolCallName: 'reviewed-tool',
  }),
});

const interruptedState = (actions: ReturnType<typeof action>[]) => ({
  messages: [new AIMessage('delegating')],
  messageId: 'main-message',
  __interrupt__: [
    {
      id: 'interrupt-1',
      value: {
        actionRequests: actions,
        reviewConfigs: [
          { actionName: 'reviewed-tool', allowedDecisions: ['approve'] },
        ],
      },
    },
  ],
});

describe('AgentService invoke interrupt routing', () => {
  it('records each paused tool call against its own conversation message', async () => {
    const { service, updateToolInterrupted } = agentFor('main-session');
    graph.invoke.mockImplementationOnce(async (_input, config) => {
      config.writer({
        action: 'AfterAIMessageSaved',
        body: { id: 'sub-ai', messageId: 'sub-message' },
        currentConversation: { sessionId: 'sub-session' },
      });
      return interruptedState([
        action('sub-session', 'sub-call'),
        action('main-session', 'main-call'),
      ]);
    });

    const result = await service.invoke();

    expect(updateToolInterrupted.mock.calls).toEqual([
      [
        'sub-session',
        'sub-message',
        'sub-call',
        'interrupt-1',
        expect.objectContaining({ order: 0 }),
      ],
      // Nothing this execution saved names the main conversation, so the
      // message the graph state carries is the one paused.
      [
        'main-session',
        'main-message',
        'main-call',
        'interrupt-1',
        expect.objectContaining({ order: 1 }),
      ],
    ]);
    expect(result.interrupt?.id).toBe('interrupt-1');
    expect(result.interrupt?.actions).toHaveLength(2);
  });

  it('skips a paused tool call whose conversation saved no message', async () => {
    const { service, updateToolInterrupted } = agentFor('main-session');
    graph.invoke.mockResolvedValueOnce(
      interruptedState([action('unknown-session', 'lost-call')]),
    );

    const result = await service.invoke();

    expect(updateToolInterrupted).not.toHaveBeenCalled();
    // The caller still learns the execution paused.
    expect(result.interrupt?.actions).toMatchObject([
      { toolCall: { id: 'lost-call' } },
    ]);
  });

  it("still delivers every event to the caller's writer", async () => {
    const { service } = agentFor('main-session');
    const writer = vi.fn();
    const event = {
      action: 'AfterAIMessageSaved',
      body: { id: 'ai', messageId: 'main-message' },
      currentConversation: { sessionId: 'main-session' },
    };
    graph.invoke.mockImplementationOnce(async (_input, config) => {
      config.writer(event);
      config.writer({ action: 'beforeToolCall', body: {} });
      return { messages: [new AIMessage('done')] };
    });

    const result = await service.invoke({ writer });

    expect(writer.mock.calls).toEqual([
      [event],
      [{ action: 'beforeToolCall', body: {} }],
    ]);
    expect(result).not.toHaveProperty('interrupt');
  });
});
