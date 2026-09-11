import { describe, expect, it, vi } from 'vitest';
import type { AIConversationEntity } from '@nocobase/ai-employee';
import { createAIChatConversation } from '../server/agent/conversation/persistence/ai-chat-conversation.js';
import { ConversationMessageStoreImpl } from '../server/agent/conversation/message-store.js';
function fixture() {
  const connection = { id: 'transaction' };
  const conversations = {
    findOne: vi.fn(async (): Promise<Partial<AIConversationEntity> | null> => ({
      thread: 3,
    })),
    update: vi.fn(async () => 1),
  };
  const messages = { destroy: vi.fn(async () => 1) };
  const usageEvents = {};
  const database = {
    transaction: vi.fn(async (callback) => callback(connection)),
  };
  const conversation = createAIChatConversation({
    conversations,
    messages,
    usageEvents,
    database,
    sessionId: 'session-1',
    snowflake: {},
  } as never);
  return { conversation, conversations, messages, database, connection };
}

describe('AIChatConversation thread persistence', () => {
  it('reads the session thread and defaults missing thread values to zero', async () => {
    const f = fixture();
    await expect(f.conversation.currentThread()).resolves.toEqual({
      sessionId: 'session-1',
      thread: 3,
      threadId: 'session-1:3',
    });
    expect(f.conversations.findOne).toHaveBeenCalledWith(
      { filter: { sessionId: 'session-1' } },
      { connection: undefined },
    );
    f.conversations.findOne.mockResolvedValue({});
    await expect(f.conversation.currentThread()).resolves.toEqual({
      sessionId: 'session-1',
      thread: 0,
      threadId: 'session-1:0',
    });
    f.conversations.findOne.mockResolvedValue(null);
    await expect(f.conversation.currentThread()).rejects.toThrow(
      'Conversation not existed',
    );
  });

  it('shares the transaction connection for thread reads, updates and message removal', async () => {
    const f = fixture();
    await f.conversation.withTransaction(async (target) => {
      await target.currentThread();
      await target.updateThread(4);
      await target.removeMessages({ messageId: 'message-1' });
    });
    expect(f.conversations.findOne).toHaveBeenCalledWith(
      { filter: { sessionId: 'session-1' } },
      { connection: f.connection },
    );
    expect(f.conversations.update).toHaveBeenCalledWith(
      {
        values: { thread: 4 },
        filter: { sessionId: 'session-1', thread: { $lt: 4 } },
      },
      { connection: f.connection },
    );
    expect(f.messages.destroy).toHaveBeenCalledWith(
      {
        filter: { sessionId: 'session-1', messageId: { $gte: 'message-1' } },
      },
      { connection: f.connection },
    );
    await f.conversation.currentThread();
    expect(f.conversations.findOne).toHaveBeenLastCalledWith(
      { filter: { sessionId: 'session-1' } },
      { connection: undefined },
    );
  });

  it('honors an explicitly supplied transaction and propagates update failures', async () => {
    const f = fixture();
    const external = { id: 'external' };
    f.conversations.update.mockRejectedValue(new Error('update failed'));
    await expect(
      f.conversation.withTransaction(
        async (target) => target.updateThread(4),
        external,
      ),
    ).rejects.toThrow('update failed');
    expect(f.database.transaction).not.toHaveBeenCalled();
    expect(f.conversations.update.mock.calls[0]?.[1]).toEqual({
      connection: external,
    });
  });

  it('lets the message store use only the conversation for thread persistence', async () => {
    const target = {
      updateThread: vi.fn(async () => undefined),
      getMessage: vi.fn(async () => ({ messageId: 'old' })),
      removeMessages: vi.fn(async () => undefined),
      addMessages: vi.fn(async () => undefined),
    };
    const conversation = {
      currentThread: vi.fn(async () => ({
        sessionId: 'session-1',
        thread: 3,
        threadId: 'session-1:3',
      })),
      withTransaction: vi.fn(async (callback) => callback(target)),
    };
    const store = new ConversationMessageStoreImpl({
      sessionId: 'session-1',
      conversation,
      persistence: { messages: {}, toolMessages: {} } as never,
      getCurrentFrontendTools: vi.fn(async () => []),
    });
    await expect(store.currentThread()).resolves.toEqual({
      sessionId: 'session-1',
      thread: 3,
      threadId: 'session-1:3',
    });
    const messages = [{ role: 'user', content: 'hello' }];
    await store.saveUserMessages(messages, 'old', {
      sessionId: 'session-1',
      thread: 4,
      threadId: 'session-1:4',
    });
    expect(target.updateThread).toHaveBeenCalledWith(4);
    expect(target.removeMessages).toHaveBeenCalledWith({ messageId: 'old' });
    expect(target.addMessages).toHaveBeenCalledWith(messages);
    target.updateThread.mockClear();
    await store.saveUserMessages([]);
    expect(target.updateThread).not.toHaveBeenCalled();
  });
});
