import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { DEFAULT_AGENT_FEATURES } from '../server/agent/types.js';
import type {
  AgentProviders,
  AgentStreamEvent,
} from '../server/agent/types.js';
import { createTestConversationProvider } from './test-conversation-provider.js';

const langchainMocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
}));

vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return { ...actual, createAgent: langchainMocks.createAgent };
});

import { AgentService } from '../server/agent/service/agent-service.js';

type StreamChunk = [string, unknown];

type Fixture = {
  service: AgentService;
  provider: LLMProvider;
  updateMessage: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  getCallback: () => { handleLLMEnd(output: unknown): void } | undefined;
};

const toStream = (chunks: StreamChunk[]): AsyncIterable<StreamChunk> => ({
  async *[Symbol.asyncIterator]() {
    yield* chunks;
  },
});

const createFixture = (chunks: StreamChunk[]): Fixture => {
  let callback: { handleLLMEnd(output: unknown): void } | undefined;
  const stream = vi.fn(async (_input: unknown, config: Record<string, any>) => {
    callback = config.callbacks?.[0];
    return toStream(chunks);
  });
  const invoke = vi.fn(async () => ({ ok: true }));
  langchainMocks.createAgent.mockReturnValue({ stream, invoke });

  const provider = {
    createModel: vi.fn(() => ({})),
    resolveTools: vi.fn(() => []),
    parseResponseMetadata: vi.fn((output: any) => [output.id, output.metadata]),
    parseResponseError: vi.fn((error: unknown) => String(error)),
    parseReasoningContent: vi.fn(() => null),
    parseResponseChunk: vi.fn((content: unknown) => content),
    parseWebSearchAction: vi.fn(() => null),
  } as unknown as LLMProvider;
  const conversation = createTestConversationProvider({
    currentConversation: { sessionId: 'session-1', username: 'dara' },
  });
  const updateMessage = vi.fn(async () => undefined);
  conversation.messages.updateMessage = updateMessage;
  const providers: AgentProviders = {
    conversation,
    logger: { warn: vi.fn(), error: vi.fn() } as never,
    context: {
      resolveLLM: vi.fn(async () => ({
        providerName: 'test',
        model: 'test-model',
        provider,
      })),
      getSystemPrompt: vi.fn(async () => undefined),
      currentConversation: vi.fn(() => ({
        sessionId: 'session-1',
        username: 'dara',
      })),
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
  };
  return {
    service: new AgentService(providers),
    provider,
    updateMessage,
    stream,
    invoke,
    getCallback: () => callback,
  };
};

const collect = async (
  stream: AsyncGenerator<AgentStreamEvent>,
): Promise<AgentStreamEvent[]> => {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
};

const contentChunk: StreamChunk = [
  'messages',
  [{ type: 'ai', content: 'done' }, {}],
];

describe('AgentService response metadata', () => {
  it('collects, consumes once, and persists metadata at the stream boundary', async () => {
    const fixture = createFixture([
      [
        'custom',
        {
          action: 'AfterAIMessageSaved',
          body: { id: 'unknown-response', messageId: 'unknown-message' },
        },
      ],
      [
        'custom',
        {
          action: 'AfterAIMessageSaved',
          body: { id: 'response-1', messageId: 'message-1' },
        },
      ],
      [
        'custom',
        {
          action: 'AfterAIMessageSaved',
          body: { id: 'response-1', messageId: 'message-2' },
        },
      ],
      contentChunk,
    ]);
    fixture.stream.mockImplementationOnce(
      async (_input: unknown, config: Record<string, any>) => {
        const callback = config.callbacks?.[0];
        expect(callback).toBeDefined();
        callback.handleLLMEnd({ id: null, metadata: { ignored: true } });
        callback.handleLLMEnd({ id: 'invalid-data', metadata: 'ignored' });
        callback.handleLLMEnd({ id: 'response-1', metadata: { tokens: 42 } });
        return toStream([
          [
            'custom',
            {
              action: 'AfterAIMessageSaved',
              body: { id: 'unknown-response', messageId: 'unknown-message' },
            },
          ],
          [
            'custom',
            {
              action: 'AfterAIMessageSaved',
              body: { id: 'response-1', messageId: 'message-1' },
            },
          ],
          [
            'custom',
            {
              action: 'AfterAIMessageSaved',
              body: { id: 'response-1', messageId: 'message-2' },
            },
          ],
          contentChunk,
        ]);
      },
    );

    await collect(fixture.service.stream());

    expect(fixture.updateMessage).toHaveBeenCalledOnce();
    expect(fixture.updateMessage).toHaveBeenCalledWith('message-1', {
      metadata: { response_metadata: { tokens: 42 } },
    });
    expect(fixture.provider.parseResponseMetadata).toHaveBeenCalledTimes(3);
  });

  it('does not persist metadata without a persisted message id', async () => {
    const fixture = createFixture([]);
    fixture.stream.mockImplementationOnce(
      async (_input: unknown, config: Record<string, any>) => {
        config.callbacks[0].handleLLMEnd({
          id: 'response-1',
          metadata: { tokens: 42 },
        });
        return toStream([
          [
            'custom',
            { action: 'AfterAIMessageSaved', body: { id: 'response-1' } },
          ],
          contentChunk,
        ]);
      },
    );

    await collect(fixture.service.stream());

    expect(fixture.updateMessage).not.toHaveBeenCalled();
  });

  it('disposes stream metadata and ignores a late callback write', async () => {
    const fixture = createFixture([contentChunk]);

    await collect(fixture.service.stream());

    const callback = fixture.getCallback();
    expect(callback).toBeDefined();
    expect(() =>
      callback?.handleLLMEnd({
        id: 'late-response',
        metadata: { tokens: 99 },
      }),
    ).not.toThrow();
    expect(fixture.updateMessage).not.toHaveBeenCalled();
  });

  it('isolates concurrent streams that use the same response id', async () => {
    const fixture = createFixture([]);
    let ready = 0;
    let release: () => void = () => undefined;
    const bothReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const configureStream = (
      stream: ReturnType<typeof vi.fn>,
      messageId: string,
      tokens: number,
    ) =>
      stream.mockImplementationOnce(
        async (_input: unknown, config: Record<string, any>) => {
          config.callbacks[0].handleLLMEnd({
            id: 'shared-response',
            metadata: { tokens },
          });
          ready++;
          if (ready === 2) release();
          await bothReady;
          return toStream([
            [
              'custom',
              {
                action: 'AfterAIMessageSaved',
                body: { id: 'shared-response', messageId },
              },
            ],
            contentChunk,
          ]);
        },
      );
    const firstStream = vi.fn();
    const secondStream = vi.fn();
    configureStream(firstStream, 'message-first', 11);
    configureStream(secondStream, 'message-second', 22);
    langchainMocks.createAgent
      .mockReset()
      .mockReturnValueOnce({ stream: firstStream, invoke: fixture.invoke })
      .mockReturnValueOnce({ stream: secondStream, invoke: fixture.invoke });

    await Promise.all([
      collect(fixture.service.stream()),
      collect(fixture.service.stream()),
    ]);

    expect(fixture.updateMessage).toHaveBeenCalledTimes(2);
    expect(fixture.updateMessage.mock.calls).toEqual(
      expect.arrayContaining([
        ['message-first', { metadata: { response_metadata: { tokens: 11 } } }],
        ['message-second', { metadata: { response_metadata: { tokens: 22 } } }],
      ]),
    );
  });

  it('ignores a callback that arrives after normal stream disposal', async () => {
    const fixture = createFixture([]);
    let lateCallback: { handleLLMEnd(output: unknown): void } | undefined;
    const firstStream = vi.fn(
      async (_input: unknown, config: Record<string, any>) => {
        lateCallback = config.callbacks[0];
        return toStream([contentChunk]);
      },
    );
    const secondStream = vi.fn(async () =>
      toStream([
        [
          'custom',
          {
            action: 'AfterAIMessageSaved',
            body: { id: 'late-response', messageId: 'late-message' },
          },
        ],
        contentChunk,
      ]),
    );
    langchainMocks.createAgent
      .mockReset()
      .mockReturnValueOnce({ stream: firstStream, invoke: fixture.invoke })
      .mockReturnValueOnce({ stream: secondStream, invoke: fixture.invoke });

    await collect(fixture.service.stream());
    lateCallback?.handleLLMEnd({
      id: 'late-response',
      metadata: { tokens: 99 },
    });
    await collect(fixture.service.stream());

    expect(fixture.updateMessage).not.toHaveBeenCalled();
  });

  it('ignores a callback that arrives after aborted stream disposal', async () => {
    const fixture = createFixture([]);
    let lateCallback: { handleLLMEnd(output: unknown): void } | undefined;
    const abortedStream = vi.fn(
      async (_input: unknown, config: Record<string, any>) => {
        lateCallback = config.callbacks[0];
        fixture.service.abort('stop');
        return {
          async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
            throw new Error('provider aborted');
          },
        };
      },
    );
    const nextStream = vi.fn(async () =>
      toStream([
        [
          'custom',
          {
            action: 'AfterAIMessageSaved',
            body: { id: 'late-response', messageId: 'late-message' },
          },
        ],
        contentChunk,
      ]),
    );
    langchainMocks.createAgent
      .mockReset()
      .mockReturnValueOnce({ stream: abortedStream, invoke: fixture.invoke })
      .mockReturnValueOnce({ stream: nextStream, invoke: fixture.invoke });

    await expect(collect(fixture.service.stream())).rejects.toMatchObject({
      code: 'ABORTED',
    });
    lateCallback?.handleLLMEnd({
      id: 'late-response',
      metadata: { tokens: 99 },
    });
    await collect(fixture.service.stream());

    expect(fixture.updateMessage).not.toHaveBeenCalled();
  });

  it('does not inject a response metadata collector for invoke', async () => {
    const fixture = createFixture([]);

    await fixture.service.invoke();

    const config = fixture.invoke.mock.calls[0]?.[1];
    expect(config).not.toHaveProperty('callbacks');
    expect(fixture.provider.parseResponseMetadata).not.toHaveBeenCalled();
  });
});
