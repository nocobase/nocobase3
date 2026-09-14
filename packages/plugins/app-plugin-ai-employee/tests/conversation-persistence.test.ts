import { describe, expect, it } from 'vitest';
import type { ConversationPersistence } from '../server/agent/contracts/persistence.js';
import { MemoryConversationPersistence } from './memory-conversation-persistence.js';

describe('ConversationPersistence test seam', () => {
  it('exposes flat repository dependencies including usage events', () => {
    const persistence: ConversationPersistence =
      new MemoryConversationPersistence();
    expect(persistence).toHaveProperty('conversations');
    expect(persistence).toHaveProperty('messages');
    expect(persistence).toHaveProperty('toolMessages');
    expect(persistence).toHaveProperty('usageEvents');
  });
});
