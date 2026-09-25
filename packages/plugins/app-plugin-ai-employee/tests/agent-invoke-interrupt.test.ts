import { AIMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { MemorySaver } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LLMProvider, ToolsEntity } from '@nocobase/ai-employee';
import { ConversationProvider } from '../server/agent/conversation/conversation-provider.js';
import { FixedAgentContextProvider } from '../server/agent/context/fixed/context.js';
import { DefaultChatMessageConverters } from '../server/agent/message/converters.js';
import { createAgentProviders } from '../server/agent/providers.js';
import { createAgentService } from '../server/agent/service/agent-service.js';
import { LLMStreamCachedManager } from '../server/manager/llm-stream-cached-manager.js';
import { MemoryConversationPersistence } from './memory-conversation-persistence.js';

/** Answers each model call with the next scripted message. */
class ScriptedChatModel extends BaseChatModel {
  public constructor(private readonly script: AIMessage[]) {
    super({});
  }

  public _llmType(): string {
    return 'scripted';
  }

  public bindTools(): this {
    return this;
  }

  public async _generate(): Promise<ChatResult> {
    const message = this.script.shift();
    if (!message) throw new Error('The script has no response left');
    return { generations: [{ message, text: String(message.content) }] };
  }
}

const createCaching = () => {
  const values = new Map<string, unknown>();
  return {
    getCache: () => ({
      get: async <T>(key: string): Promise<T | undefined> =>
        values.get(key) as T | undefined,
      set: async <T>(key: string, value: T): Promise<void> => {
        values.set(key, value);
      },
      delete: async (key: string): Promise<boolean> => values.delete(key),
    }),
  };
};

/**
 * An agent on a real graph and checkpointer whose one tool needs a reviewer's
 * approval. The model first asks for the tool, then answers.
 */
const reviewedAgent = (sessionId: string) => {
  const persistence = new MemoryConversationPersistence(sessionId);
  const conversation = new ConversationProvider({
    sessionId,
    persistence,
    streamCache: new LLMStreamCachedManager(createCaching()),
    employeesManager: {
      registerAgentAbortHandle: vi.fn(),
      unregisterAgentAbortHandle: vi.fn(),
    } as never,
  });
  const lookup = vi.fn(async () => ({ status: 'success', content: 'found' }));
  const tool = {
    scope: 'GENERAL',
    execution: 'backend',
    auto: false,
    definition: {
      name: 'lookup',
      description: 'Looks something up',
      schema: z.object({ query: z.string() }),
    },
    invoke: lookup,
  } as unknown as ToolsEntity;
  const model = new ScriptedChatModel([
    new AIMessage({
      content: '',
      tool_calls: [
        { id: 'call-1', name: 'lookup', args: { query: 'capital' } },
      ],
    }),
    new AIMessage('Paris'),
  ]);
  const provider = {
    createModel: () => model,
    resolveTools: (tools: unknown[]) => tools,
    prepareStoredAssistantAdditionalKwargs: (
      additionalKwargs?: Record<string, unknown>,
    ) => additionalKwargs,
  } as unknown as LLMProvider;
  const context = new FixedAgentContextProvider({
    sessionId,
    agentContext: { state: { sessionId } } as never,
    model: { llmService: 'test-service', model: 'test-model' },
    provider,
    providerName: 'test',
    llmService: 'test-service',
    tools: new Map([['lookup', tool]]),
  });
  const service = createAgentService(
    createAgentProviders({
      conversation,
      context,
      converters: new DefaultChatMessageConverters(),
      checkpointer: new MemorySaver(),
      logger: { warn: vi.fn(), error: vi.fn() } as never,
    }),
  );
  return { service, persistence, lookup, conversation };
};

const question = [
  { role: 'user' as const, content: { type: 'text', content: 'capital?' } },
];

describe('AgentService invoke with a human-in-the-loop tool', () => {
  it('reports the interrupt and records the paused tool call', async () => {
    const { service, persistence, lookup } = reviewedAgent('invoke-hitl');

    const result = await service.invoke({ userMessages: question });

    expect(lookup).not.toHaveBeenCalled();
    expect(result.interrupt).toMatchObject({
      id: expect.any(String),
      actions: [
        {
          order: 0,
          allowedDecisions: ['approve', 'reject', 'edit'],
          toolCall: { id: 'call-1', name: 'lookup' },
          currentConversation: { sessionId: 'invoke-hitl' },
        },
      ],
    });
    // The assistant turn that asked for the tool, not a finished answer.
    expect(result.message?.toolCalls).toMatchObject([
      { id: 'call-1', name: 'lookup' },
    ]);
    // What a reviewer's decision and the resume after it depend on.
    const [toolMessage] = persistence.toolMessagesFor('invoke-hitl');
    expect(toolMessage).toMatchObject({
      toolCallId: 'call-1',
      invokeStatus: 'interrupted',
      interruptActionOrder: 0,
    });
    const assistant = persistence
      .messagesFor('invoke-hitl')
      .find((message) => message.role === 'assistant');
    expect(assistant?.messageId).toBe(toolMessage?.messageId);
    expect(assistant?.metadata?.interruptId).toBe(result.interrupt?.id);
  });

  it('runs the approved tool when the recorded interrupt is resumed', async () => {
    const { service, persistence, lookup } = reviewedAgent('resume-hitl');
    const paused = await service.invoke({ userMessages: question });
    const interruptId = paused.interrupt?.id;
    expect(interruptId).toBeDefined();

    const result = await service.resumeInvoke({
      userDecisions: { interruptId, decisions: [{ type: 'approve' }] },
    });

    expect(lookup).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty('interrupt');
    expect(result.message?.content).toEqual({
      type: 'text',
      content: 'Paris',
    });
    expect(persistence.toolMessagesFor('resume-hitl')).toMatchObject([
      { toolCallId: 'call-1', invokeStatus: 'confirmed' },
    ]);
  });
});
