import { describe, expect, it, vi } from 'vitest';
import { ConversationProvider } from '../server/agent/conversation/conversation-provider.js';
import type { ConversationPersistence } from '../server/agent/contracts/persistence.js';

function createProvider(
  sessionId: string,
  streamCache: object,
  manager: object,
) {
  const persistence = {
    createChatConversation: vi.fn(() => ({})),
    conversations: { update: vi.fn() },
    messages: {
      find: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    toolMessages: {
      find: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    usageEvents: { upsert: vi.fn() },
  } as unknown as ConversationPersistence;
  const streamCacheManager = {
    getCached: vi.fn(() => streamCache),
  };
  return new ConversationProvider({
    sessionId,
    persistence,
    streamCache: streamCacheManager as never,
    employeesManager: manager as never,
    database: { transaction: vi.fn() } as never,
    snowflake: {} as never,
  });
}

describe('ConversationProvider session lifecycle', () => {
  it('creates isolated message, cache, event, and abort objects per session', () => {
    const firstManager = {
      registerAgentAbortHandle: vi.fn(),
      unregisterAgentAbortHandle: vi.fn(),
    };
    const secondManager = {
      registerAgentAbortHandle: vi.fn(),
      unregisterAgentAbortHandle: vi.fn(),
    };
    const first = createProvider('session-1', {}, firstManager);
    const second = createProvider('session-2', {}, secondManager);

    expect(first.messages).not.toBe(second.messages);
    expect(first.streamCache).not.toBe(second.streamCache);
    expect(first.event).not.toBe(second.event);
    expect(first.abort).not.toBe(second.abort);

    const token = Symbol('abort');
    const handle = { signal: new AbortController().signal, abort: vi.fn() };
    first.abort.registerAbortHandle(token, handle);
    first.abort.unregisterAbortHandle(token);

    expect(firstManager.registerAgentAbortHandle).toHaveBeenCalledWith(
      'session-1',
      token,
      handle,
    );
    expect(firstManager.unregisterAgentAbortHandle).toHaveBeenCalledWith(
      'session-1',
      token,
    );
    expect(secondManager.registerAgentAbortHandle).not.toHaveBeenCalled();
  });
});
