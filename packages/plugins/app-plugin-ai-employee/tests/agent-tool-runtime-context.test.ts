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
  const seen: unknown[] = [];
  const recordingTool = {
    scope: 'GENERAL',
    definition: { name: 'record-context', description: 'records its context' },
    invoke: async (ctx: unknown) => {
      seen.push(ctx);
      return 'ok';
    },
  };
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
        tools: new Map([['record-context', recordingTool]]),
        activeTools: async () => new Set(['record-context']),
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
  /** Runs the tool the agent was built with, the way the graph would. */
  const runBuiltTool = async (): Promise<unknown> => {
    const [built] = mocks.createAgent.mock.calls.at(-1)[0].tools;
    await built.invoke({}, { context: {}, toolCall: { id: 'call-1' } });
    return seen.at(-1);
  };
  return { service: new AgentService(providers), invoke, runBuiltTool };
}

const userMessages = [
  { role: 'user' as const, content: { type: 'text' as const, content: 'hi' } },
];

describe('AgentService tool runtime context', () => {
  it('builds each tool with the context fixed when the service was created', async () => {
    const { service, runBuiltTool } = createFixture();

    await service.invoke({ userMessages });

    // The tool declared nothing, so it receives the execution context and an
    // empty `deps` — not the provider object itself, and nothing ambient.
    expect(await runBuiltTool()).toEqual({ ...runtimeContext, deps: {} });
  });

  it('ignores an agent context supplied by a request and keeps the other request values', async () => {
    const { service, invoke, runBuiltTool } = createFixture();

    await service.invoke({
      userMessages,
      context: {
        agentContext: { marker: 'from-request' },
        timezone: 'Asia/Shanghai',
      },
    });

    expect(await runBuiltTool()).toEqual({ ...runtimeContext, deps: {} });
    const config = invoke.mock.calls[0][1];
    // The key reaches nothing now, and is not forwarded either.
    expect(config.context).not.toHaveProperty('agentContext');
    expect(config.context.timezone).toBe('Asia/Shanghai');
  });
});
