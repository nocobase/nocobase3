import { describe, expect, it, vi } from 'vitest';
import type { ToolsEntity } from '@nocobase/ai-employee';

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

const tool = (name: string, auto: boolean): ToolsEntity =>
  ({
    scope: 'GENERAL',
    execution: 'backend',
    auto,
    definition: { name, description: name, schema: {} },
    invoke: vi.fn(),
  }) as ToolsEntity;

function createFixture(toolMaps: ReadonlyMap<string, ToolsEntity>[]) {
  const resolveTools = vi.fn((tools) => tools);
  const discoveredTools = vi.fn(async () => {
    const next = toolMaps.shift();
    if (!next) throw new Error('missing tool fixture');
    return { tools: next, activeTools };
  });
  const activeTools = vi.fn(async () => new Set<string>());
  const conversation = createTestConversationProvider({
    sessionId: 'snapshot',
  });
  const providers = {
    conversation,
    logger: { warn: vi.fn(), error: vi.fn() },
    chatContext: {
      resolveLLM: vi.fn(async () => ({
        providerName: 'test',
        model: 'test',
        provider: {
          createModel: vi.fn(() => ({})),
          resolveTools,
          parseResponseError: vi.fn((error) => String(error)),
          parseReasoningContent: vi.fn(() => null),
          parseResponseChunk: vi.fn((content) => content),
          parseWebSearchAction: vi.fn(() => null),
        },
      })),
      getSystemPrompt: vi.fn(async () => undefined),
      currentConversation: vi.fn(() => ({ sessionId: 'snapshot' })),
      discoveredTools,
    },
    converters: {
      formatMessages: vi.fn(async (messages) => messages),
      assistant: { convert: vi.fn() },
      human: { convert: vi.fn() },
      tool: { convert: vi.fn() },
    },
    features: { ...DEFAULT_AGENT_FEATURES },
  } as never;
  return {
    service: new AgentService(providers),
    providers,
    discoveredTools,
    activeTools,
    resolveTools,
  };
}

describe('AgentService tool snapshots', () => {
  it('discovers once and passes the same result through each execution', async () => {
    const firstSource = new Map([['first', tool('first', true)]]);
    const secondSource = new Map([['second', tool('second', false)]]);
    const fixture = createFixture([firstSource, secondSource]);
    const releases: Array<() => void> = [];
    mocks.createAgent.mockReset().mockImplementation(() => ({
      invoke: () =>
        new Promise((resolve) => releases.push(() => resolve({ ok: true }))),
    }));

    const first = fixture.service.invoke();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    const second = fixture.service.invoke();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    await Promise.all([first, second]);

    expect(fixture.discoveredTools).toHaveBeenCalledTimes(2);
    const firstPrepared = mocks.buildStandardAgentMiddleware.mock.calls[0]?.[1];
    const secondPrepared =
      mocks.buildStandardAgentMiddleware.mock.calls[1]?.[1];
    expect(firstPrepared.discoveredTools.tools).toBe(firstSource);
    expect([...firstPrepared.discoveredTools.tools.keys()]).toEqual(['first']);
    expect(firstPrepared.discoveredTools.activeTools).toBe(fixture.activeTools);
    expect([...secondPrepared.discoveredTools.tools.keys()]).toEqual([
      'second',
    ]);
    expect(firstPrepared.discoveredTools.tools).not.toBe(
      secondPrepared.discoveredTools.tools,
    );
    expect(fixture.resolveTools).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ name: 'first' })]),
    );
    expect(fixture.resolveTools).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ name: 'second' })]),
    );
  });

  it('passes the prepared snapshot when persisting a gathered abort', async () => {
    const source = new Map([['review', tool('review', false)]]);
    const fixture = createFixture([source]);
    const saveAssistantMessage = vi.spyOn(
      (fixture.providers as any).conversation.messages,
      'saveAssistantMessage',
    );
    (fixture.providers as any).converters.assistant.convert = vi.fn(
      async () => ({
        role: 'assistant',
        content: { type: 'text', content: '' },
      }),
    );
    mocks.createAgent.mockReset().mockReturnValue({
      stream: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() {
          yield ['messages', [{ type: 'ai', content: 'partial' }, {}]];
          fixture.service.abort('stop');
          throw new Error('provider aborted');
        },
      })),
    });

    const events = fixture.service.stream();
    await expect(
      (async () => {
        for await (const _event of events) {
          // Drain the stream until the abort is normalized.
        }
      })(),
    ).rejects.toMatchObject({ code: 'ABORTED' });

    const prepared = mocks.buildStandardAgentMiddleware.mock.calls.at(-1)?.[1];
    expect(saveAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ interrupted: true }),
      }),
      prepared.discoveredTools.tools,
    );
  });

  it('uses the same discovery path for invoke, stream, resume, and fork', async () => {
    const maps = Array.from(
      { length: 6 },
      (_, index) => new Map([[`tool-${index}`, tool(`tool-${index}`, true)]]),
    );
    const fixture = createFixture([...maps]);
    mocks.createAgent.mockReset().mockImplementation(() => ({
      invoke: vi.fn(async () => ({ ok: true })),
      stream: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() {
          yield ['messages', [{ type: 'ai', content: 'done' }, {}]];
        },
      })),
    }));
    const drain = async (stream: AsyncGenerator<unknown>) => {
      for await (const _event of stream) {
        // Drain the operation.
      }
    };

    await fixture.service.invoke();
    await drain(fixture.service.stream());
    await fixture.service.resumeInvoke({});
    await drain(fixture.service.resumeStream({}));
    await fixture.service.forkInvoke({});
    await drain(fixture.service.forkStream({}));

    expect(fixture.discoveredTools).toHaveBeenCalledTimes(6);
    const preparedMaps = mocks.buildStandardAgentMiddleware.mock.calls
      .slice(-6)
      .map((call) => call[1].discoveredTools.tools);
    expect(preparedMaps.map((map) => [...map.keys()])).toEqual(
      maps.map((map) => [...map.keys()]),
    );
    expect(new Set(preparedMaps).size).toBe(6);
  });

  it('keeps one dynamic active-tool resolver on the execution snapshot', async () => {
    const source = new Map([
      ['base', tool('base', true)],
      ['skillTool', tool('skillTool', true)],
    ]);
    const fixture = createFixture([source]);
    fixture.activeTools.mockResolvedValue(new Set(['base', 'skillTool']));
    mocks.createAgent.mockReset().mockReturnValue({
      invoke: vi.fn(async () => ({ ok: true })),
    });

    await fixture.service.invoke();

    const prepared = mocks.buildStandardAgentMiddleware.mock.calls.at(-1)?.[1];
    expect(await prepared.discoveredTools.activeTools()).toEqual(
      new Set(['base', 'skillTool']),
    );
    expect(fixture.activeTools).toHaveBeenCalledOnce();
  });
  it('uses empty snapshots without discovering when tools are disabled', async () => {
    const fixture = createFixture([]);
    (fixture.providers as any).features.tools = false;
    mocks.createAgent.mockReset().mockReturnValue({
      invoke: vi.fn(async () => ({ ok: true })),
    });

    await fixture.service.invoke();

    expect(fixture.discoveredTools).not.toHaveBeenCalled();
    const prepared = mocks.buildStandardAgentMiddleware.mock.calls.at(-1)?.[1];
    expect(prepared.discoveredTools.tools).toEqual(new Map());
    expect(await prepared.discoveredTools.activeTools()).toEqual(new Set());
  });
});
