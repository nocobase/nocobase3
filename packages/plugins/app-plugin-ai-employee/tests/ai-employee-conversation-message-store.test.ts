import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ConversationMessageStoreImpl } from '../server/agent/conversation/message-store.js';

const serverRoot = path.resolve(import.meta.dirname, '../server');
const read = (relative: string): string =>
  fs.readFileSync(path.join(serverRoot, relative), 'utf8');

function createFixture() {
  const transaction = { id: 'transaction-1' };
  const target = {
    addMessages: vi.fn(),
    getMessage: vi.fn(async () => null),
    removeMessages: vi.fn(async () => undefined),
    updateThread: vi.fn(async () => undefined),
  };
  const conversation = {
    withTransaction: vi.fn(async (callback) => callback(target, transaction)),
    listMessages: vi.fn(async () => []),
    getMessage: vi.fn(async () => null),
    addMessages: vi.fn(),
    removeMessages: vi.fn(async () => undefined),
  };
  const toolMessages = {
    create: vi.fn(async ({ values }) => values),
    update: vi.fn(async () => 1),
  };
  const messages = {
    create: vi.fn(async ({ values }) => values),
    update: vi.fn(async () => 1),
    findOne: vi.fn(async () => null),
    find: vi.fn(async () => []),
  };
  const database = {
    transaction: vi.fn(async (callback) => callback(transaction)),
  };
  const getCurrentFrontendTools = vi.fn(async () => []);
  const toolMap = new Map([
    [
      'knownTool',
      {
        scope: 'GENERAL',
        definition: { name: 'knownTool' },
        execution: 'frontend',
        auto: true,
      },
    ],
  ]);
  const store = new ConversationMessageStoreImpl({
    sessionId: 'session-1',
    conversation,
    persistence: { messages, toolMessages } as never,
    getCurrentFrontendTools,
  } as never);
  return {
    transaction,
    target,
    conversation,
    toolMessages,
    messages,
    database,
    getCurrentFrontendTools,
    toolMap,
    store,
  };
}

describe('AI employee conversation message persistence boundary', () => {
  it('owns assistant tool-call initialization in a dedicated message store', () => {
    const source = read('agent/conversation/message-store.ts');

    expect(source).toContain('class ConversationMessageStoreImpl');
    expect(source).toContain(
      'private readonly conversation: AIChatConversation',
    );
    expect(source).toContain(
      'private readonly persistence: ConversationPersistence',
    );
    expect(source).not.toContain('private readonly options:');
    expect(source).not.toContain('this.options.');
    expect(source).toContain('saved.toolCalls ?? []');
    expect(source).toContain('{ connection: transaction }');
    expect(source).not.toContain('LCCheckpointRepository');
    expect(source).not.toContain('LCCheckpointBlobRepository');
    expect(source).not.toContain('LCCheckpointWriteRepository');
    expect(source).not.toContain('NativeCollectionSaver');
    expect(source).not.toContain('BaseCheckpointSaver');
    expect(source).not.toContain('createAgent');
  });

  it('owns tool-message confirmation in the same message store transaction', () => {
    const source = read('agent/conversation/message-store.ts');

    expect(source).toContain('Tool message requires metadata.toolCallId');
    expect(source).toContain("values: { invokeStatus: 'confirmed' }");
    expect(source).toContain('toolCallId: { $in: toolCallIds }');
  });

  it('initializes known and missing calls from the persisted assistant message', async () => {
    const fixture = createFixture();
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      role: 'dara',
      content: { type: 'text', content: 'answer' },
      toolCalls: [
        { id: 'call-1', name: 'knownTool', args: { value: 1 } },
        { id: 'call-2', name: 'missingTool', args: { value: 2 } },
      ],
    });

    const result = await fixture.store.saveAssistantMessage(
      {
        role: 'dara',
        content: { type: 'text', content: 'answer' },
        toolCalls: [{ id: 'input-call', name: 'ignoredTool', args: {} }],
      },
      fixture.toolMap,
    );

    expect(fixture.toolMessages.create).toHaveBeenCalledWith(
      {
        values: [
          expect.objectContaining({
            messageId: 'persisted-message',
            toolCallId: 'call-1',
            invokeStatus: 'init',
            execution: 'frontend',
            auto: true,
          }),
          expect.objectContaining({
            messageId: 'persisted-message',
            toolCallId: 'call-2',
            status: 'error',
            content: 'Tool missingTool not found',
            invokeStatus: 'done',
            execution: 'backend',
          }),
        ],
      },
      { connection: fixture.transaction },
    );
    expect(result.message.messageId).toBe('persisted-message');
    expect(result.initializedToolCalls).toHaveLength(2);
    expect(result.initializedToolCalls[1]?.invokeStartTime).toBeInstanceOf(
      Date,
    );
    expect(result.initializedToolCalls[1]?.invokeEndTime).toBe(
      result.initializedToolCalls[1]?.invokeStartTime,
    );
  });

  it('resolves frontend auto per tool call and loads manifests once', async () => {
    const fixture = createFixture();
    fixture.getCurrentFrontendTools.mockResolvedValue([
      { id: 'block:allow', permission: 'ALLOW' },
      { id: 'block:ask', permission: 'ASK' },
    ]);
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      toolCalls: [
        {
          id: 'call-1',
          name: 'executeFrontendTool',
          args: { toolId: 'block:allow' },
        },
        {
          id: 'call-2',
          name: 'executeFrontendTool',
          args: { toolId: 'block:ask' },
        },
        {
          id: 'call-3',
          name: 'executeFrontendTool',
          args: { toolId: 'missing' },
        },
      ],
    });
    const frontendTool = {
      scope: 'GENERAL',
      execution: 'frontend',
      definition: { name: 'executeFrontendTool' },
    };

    const result = await fixture.store.saveAssistantMessage(
      { role: 'dara', content: { type: 'text', content: '' } },
      new Map([['executeFrontendTool', frontendTool]]),
    );

    expect(result.initializedToolCalls.map((item) => item.auto)).toEqual([
      true,
      false,
      false,
    ]);
    expect(fixture.getCurrentFrontendTools).toHaveBeenCalledOnce();
  });

  it('does not load frontend manifests for ordinary tools', async () => {
    const fixture = createFixture();
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      toolCalls: [{ id: 'call-1', name: 'knownTool', args: {} }],
    });

    const result = await fixture.store.saveAssistantMessage(
      { role: 'dara', content: { type: 'text', content: '' } },
      fixture.toolMap,
    );

    expect(result.initializedToolCalls[0]?.auto).toBe(true);
    expect(fixture.getCurrentFrontendTools).not.toHaveBeenCalled();
  });

  it('persists false for unresolved ordinary and malformed frontend policy', async () => {
    const fixture = createFixture();
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      toolCalls: [
        { id: 'call-1', name: 'ordinaryFalse', args: {} },
        { id: 'call-2', name: 'ordinaryUndefined', args: {} },
        { id: 'call-3', name: 'executeFrontendTool', args: null },
        { id: 'call-4', name: 'executeFrontendTool', args: {} },
      ],
    });
    const toolMap = new Map([
      [
        'ordinaryFalse',
        {
          scope: 'GENERAL',
          auto: false,
          definition: { name: 'ordinaryFalse' },
        },
      ],
      [
        'ordinaryUndefined',
        { scope: 'GENERAL', definition: { name: 'ordinaryUndefined' } },
      ],
      [
        'executeFrontendTool',
        {
          scope: 'GENERAL',
          execution: 'frontend',
          definition: { name: 'executeFrontendTool' },
        },
      ],
    ]);

    const result = await fixture.store.saveAssistantMessage(
      { role: 'dara', content: { type: 'text', content: '' } },
      toolMap,
    );

    expect(result.initializedToolCalls.map((item) => item.auto)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(fixture.getCurrentFrontendTools).not.toHaveBeenCalled();
  });

  it('propagates frontend manifest failures through the persistence transaction', async () => {
    const fixture = createFixture();
    fixture.getCurrentFrontendTools.mockRejectedValue(
      new Error('manifest failed'),
    );
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      toolCalls: [
        {
          id: 'call-1',
          name: 'executeFrontendTool',
          args: { toolId: 'block:tool' },
        },
      ],
    });

    await expect(
      fixture.store.saveAssistantMessage(
        { role: 'dara', content: { type: 'text', content: '' } },
        new Map([
          [
            'executeFrontendTool',
            {
              scope: 'GENERAL',
              execution: 'frontend',
              definition: { name: 'executeFrontendTool' },
            },
          ],
        ]),
      ),
    ).rejects.toThrow('manifest failed');
    expect(fixture.conversation.withTransaction).toHaveBeenCalledOnce();
    expect(fixture.toolMessages.create).not.toHaveBeenCalled();
  });
  it('does not access the tool-message repository without persisted tool calls', async () => {
    const fixture = createFixture();
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      role: 'dara',
      content: { type: 'text', content: 'answer' },
    });

    await expect(
      fixture.store.saveAssistantMessage(
        {
          role: 'dara',
          content: { type: 'text', content: 'answer' },
        },
        fixture.toolMap,
      ),
    ).resolves.toMatchObject({ initializedToolCalls: [] });
    expect(fixture.toolMessages.create).not.toHaveBeenCalled();
    expect(fixture.getCurrentFrontendTools).not.toHaveBeenCalled();
  });

  it('propagates initialization failures from the message transaction', async () => {
    const fixture = createFixture();
    fixture.target.addMessages.mockResolvedValue({
      messageId: 'persisted-message',
      sessionId: 'session-1',
      toolCalls: [{ id: 'call-1', name: 'knownTool', args: {} }],
    });
    fixture.toolMessages.create.mockRejectedValue(
      new Error('initialize failed'),
    );

    await expect(
      fixture.store.saveAssistantMessage(
        {
          role: 'dara',
          content: { type: 'text', content: 'answer' },
        },
        fixture.toolMap,
      ),
    ).rejects.toThrow('initialize failed');
    expect(fixture.conversation.withTransaction).toHaveBeenCalledOnce();
  });

  it('saves tool messages and confirms derived call IDs in one transaction', async () => {
    const fixture = createFixture();
    const messages = [
      {
        role: 'tool',
        content: { type: 'text', content: 'one' },
        metadata: { toolCallId: 'call-1' },
      },
      {
        role: 'tool',
        content: { type: 'text', content: 'two' },
        metadata: { toolCallId: 'call-2' },
      },
    ];

    await fixture.store.saveToolMessages('source-message', messages);

    expect(fixture.target.addMessages).toHaveBeenCalledWith(messages);
    expect(fixture.toolMessages.update).toHaveBeenCalledWith(
      {
        values: { invokeStatus: 'confirmed' },
        filter: {
          sessionId: 'session-1',
          messageId: 'source-message',
          toolCallId: { $in: ['call-1', 'call-2'] },
        },
      },
      { connection: fixture.transaction },
    );
    expect(fixture.conversation.withTransaction).toHaveBeenCalledOnce();
  });

  it('rejects invalid tool messages before starting a transaction', async () => {
    const fixture = createFixture();

    await expect(
      fixture.store.saveToolMessages('source-message', [
        {
          role: 'tool',
          content: { type: 'text', content: 'result' },
          metadata: {},
        },
      ]),
    ).rejects.toThrow('Tool message requires metadata.toolCallId');
    expect(fixture.conversation.withTransaction).not.toHaveBeenCalled();
    expect(fixture.target.addMessages).not.toHaveBeenCalled();
  });

  it('does nothing for an empty tool-message batch', async () => {
    const fixture = createFixture();

    await expect(
      fixture.store.saveToolMessages('source-message', []),
    ).resolves.toBeUndefined();
    expect(fixture.conversation.withTransaction).not.toHaveBeenCalled();
  });

  it('propagates confirmation failures through the transaction callback', async () => {
    const fixture = createFixture();
    fixture.toolMessages.update.mockRejectedValue(new Error('confirm failed'));

    await expect(
      fixture.store.saveToolMessages('source-message', [
        {
          role: 'tool',
          content: { type: 'text', content: 'result' },
          metadata: { toolCallId: 'call-1' },
        },
      ]),
    ).rejects.toThrow('confirm failed');
    expect(fixture.target.addMessages).toHaveBeenCalledOnce();
  });
});
