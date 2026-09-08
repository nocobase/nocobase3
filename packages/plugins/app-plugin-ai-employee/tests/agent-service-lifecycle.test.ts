import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AgentService } from '../server/agent/agent-service.js';
import { createMemoryConversationProvider } from '../server/agent/providers.js';
import type {
  AgentProviders,
  ResolvedAgentLLM,
} from '../server/agent/types.js';

const provider = {
  parseResponseError: (error) => (error as Error).message,
} as unknown as LLMProvider;

const createProviders = (dispose: ReturnType<typeof vi.fn>): AgentProviders => {
  const llm: ResolvedAgentLLM = {
    providerName: 'test',
    model: 'test',
    provider,
    dispose,
  };
  return {
    conversation: createMemoryConversationProvider(),
    chatContext: {
      resolveLLM: vi.fn(async () => llm),
      getSystemPrompt: vi.fn(async () => undefined),
      discoveredTools: vi.fn(async () => []),
      activeTools: vi.fn(async () => new Set()),
      getExecutionConfig: vi.fn(async () => ({})),
      shouldInterruptToolCall: vi.fn(() => false),
      getToolsMap: vi.fn(async () => new Map()),
    },
    chatMessageConverters: {
      formatMessages: vi.fn(async () => {
        throw new Error('prepare failed');
      }),
      assistant: { toStored: vi.fn() },
      human: { toStored: vi.fn() },
      tool: { toStored: vi.fn() },
    } as any,
    tools: {} as any,
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
};

describe('AgentService execution-local LLM lifecycle', () => {
  it('disposes a resolved LLM when invoke preparation fails', async () => {
    const dispose = vi.fn();
    const service = new AgentService(createProviders(dispose));
    await expect(service.invoke()).rejects.toThrow('Agent execution failed');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('disposes a resolved LLM when stream preparation fails', async () => {
    const dispose = vi.fn();
    const service = new AgentService(createProviders(dispose));
    const stream = service.stream();
    await expect(stream.next()).rejects.toThrow('prepare failed');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
