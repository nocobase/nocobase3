import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgentService } from '../server/agent/service/agent-service.js';
import { createAgentProviders } from '../server/agent/providers.js';
import { DefaultChatMessageConverters } from '../server/agent/message/converters.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import type { AgentContextProvider } from '../server/agent/types.js';

const createAgentSpy = vi.fn();

// The agent loop itself is not under test here; what it returns is. The stub
// returns a graph state carrying both the answer and the keys this package's
// own middleware contributes, so the result contract can be asserted against
// something a real execution would produce.
vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return {
    ...actual,
    createAgent: (params: unknown) => {
      createAgentSpy(params);
      return {
        invoke: async () => ({
          messages: [
            new HumanMessage('hi'),
            new AIMessage({
              content: 'let me look that up',
              tool_calls: [{ id: 'call-1', name: 'search', args: {} }],
            }),
            new ToolMessage({ content: 'found it', tool_call_id: 'call-1' }),
            new AIMessage('the answer'),
          ],
          structuredResponse: { capital: 'Paris' },
          messageId: 'internal-state',
          lastMessageIndex: {
            lastHumanMessageIndex: 1,
            lastAIMessageIndex: 1,
            lastToolMessageIndex: 0,
            lastMessageIndex: 2,
          },
        }),
      };
    },
  };
});

const provider = {
  createModel: () => ({}),
  resolveTools: () => [],
  prepareStoredAssistantAdditionalKwargs: (
    additionalKwargs?: Record<string, unknown>,
  ) => additionalKwargs,
  parseResponseError: (error: unknown) =>
    error instanceof Error ? error.message : 'unexpected',
} as never;

const agentFor = (sessionId: string) => {
  const context: AgentContextProvider = {
    currentConversation: () => ({ sessionId }),
    toolRuntimeContext: () => ({}),
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
  return createAgentService(
    createAgentProviders({
      conversation: createTestConversationProvider({ sessionId }),
      context,
      converters: new DefaultChatMessageConverters(),
    }),
  );
};

const userTurn = [{ role: 'user', content: 'hi' }];

describe('AgentService invoke result', () => {
  it("reports the assistant turn in this package's own message shape", async () => {
    const result = await agentFor('invoke-shape').invoke({
      userMessages: userTurn,
    });
    expect(result.message).toMatchObject({
      role: 'assistant',
      content: { type: 'text', content: 'the answer' },
      metadata: { provider: 'test', model: 'test-model' },
    });
  });

  it('reports the answer, not the tool-calling turns that led to it', async () => {
    // The loop runs the model once per tool round, so the state holds several
    // AI messages. The last one is the answer: the loop ends precisely when the
    // model returns a message with no tool calls. The ones before it are the
    // agent working, and the ConversationMiddleware persists each of them.
    const result = await agentFor('invoke-multi').invoke({
      userMessages: userTurn,
    });
    expect(result.message?.content).toEqual({
      type: 'text',
      content: 'the answer',
    });
    expect(result.message?.toolCalls ?? []).toHaveLength(0);
  });

  it('keeps the graph state this package owns out of the result', async () => {
    const result = await agentFor('invoke-state').invoke({
      userMessages: userTurn,
    });
    expect(Object.keys(result).sort()).toEqual([
      'message',
      'structuredResponse',
    ]);
    expect(result).not.toHaveProperty('messages');
    expect(result).not.toHaveProperty('lastMessageIndex');
  });

  it('forwards a requested response format and reports the structured value', async () => {
    createAgentSpy.mockClear();
    const responseFormat = z.object({ capital: z.string() });
    const result = await agentFor('invoke-structured').invoke({
      userMessages: [{ role: 'user', content: 'capital of France?' }],
      responseFormat,
    });
    expect(createAgentSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      responseFormat,
    });
    expect(result.structuredResponse).toEqual({ capital: 'Paris' });
  });

  it('asks for no response format when the request supplies none', async () => {
    createAgentSpy.mockClear();
    await agentFor('invoke-plain').invoke({ userMessages: userTurn });
    expect(createAgentSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'responseFormat',
    );
  });
});
