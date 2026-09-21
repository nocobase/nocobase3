import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  buildStandardAgentMiddleware: vi.fn(() => []),
}));

vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return { ...actual, createAgent: mocks.createAgent };
});

vi.mock('../server/agent/middleware/pipeline.js', () => ({
  buildStandardAgentMiddleware: mocks.buildStandardAgentMiddleware,
}));

import { AgentService } from '../server/agent/service/agent-service.js';
import { createTestConversationProvider } from './test-conversation-provider.js';
import { DEFAULT_AGENT_FEATURES } from '../server/agent/types.js';

const runtimeContext = { marker: 'from-provider' };

function createFixture() {
  const invoke = vi.fn(async () => ({ messages: [] }));
  mocks.createAgent.mockReturnValue({ invoke });
  const providers = {
    conversation: createTestConversationProvider({ sessionId: 'runtime' }),
    logger: { warn: vi.fn(), error: vi.fn() },
    context: {
      toolRuntimeContext: vi.fn(() => runtimeContext),
      currentConversation: vi.fn(() => ({ sessionId: 'runtime' })),
      resolveLLM: vi.fn(async () => ({
        providerName: 'test',
        model: 'test',
        provider: {
          createModel: vi.fn(() => ({})),
          resolveTools: vi.fn((tools) => tools),
          parseResponseError: vi.fn((error) => String(error)),
        },
      })),
      getSystemPrompt: vi.fn(async () => undefined),
      discoveredTools: vi.fn(async () => ({
        tools: new Map(),
        activeTools: async () => new Set(),
      })),
    },
    converters: {
      formatMessages: vi.fn(async (messages) => messages),
      assistant: { convert: vi.fn() },
      human: { convert: vi.fn() },
      tool: { convert: vi.fn() },
    },
    features: { ...DEFAULT_AGENT_FEATURES },
  } as never;
  return { service: new AgentService(providers), invoke };
}

const userMessages = [
  { role: 'user' as const, content: { type: 'text' as const, content: 'hi' } },
];

describe('AgentService tool runtime context', () => {
  it('takes the tool context from the provider that was fixed at creation', async () => {
    const { service, invoke } = createFixture();

    await service.invoke({ userMessages });

    expect(invoke.mock.calls[0][1].context.agentContext).toBe(runtimeContext);
  });

  it('ignores an agent context supplied by a request and keeps the other request values', async () => {
    const { service, invoke } = createFixture();

    await service.invoke({
      userMessages,
      context: {
        agentContext: { marker: 'from-request' },
        timezone: 'Asia/Shanghai',
      },
    });

    const config = invoke.mock.calls[0][1];
    expect(config.context.agentContext).toBe(runtimeContext);
    expect(config.context.timezone).toBe('Asia/Shanghai');
  });
});
