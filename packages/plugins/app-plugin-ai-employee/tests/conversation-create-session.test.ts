import type { AIManager } from '@nocobase/ai-employee';
import { describe, expect, it } from 'vitest';

import type { RepositoryFactory } from '../server/factory/repository-factory.js';
import { AIConversationsManager } from '../server/manager/ai-conversations-manager.js';

function managerCreating(created: Record<string, unknown>) {
  const repositories = {
    aiConversations: { create: async () => created },
  } as unknown as RepositoryFactory;
  return new AIConversationsManager({} as AIManager, repositories);
}

describe('AIConversationsManager.create()', () => {
  it('returns the conversation with the sessionId an agent state needs', async () => {
    const conversation = await managerCreating({
      sessionId: 'session-1',
      title: 'Order enquiry',
    }).create({ userId: 1, title: 'Order enquiry' });

    // Typed as a string, so `state: { sessionId: conversation.sessionId }`
    // compiles under strict mode without a non-null assertion.
    const sessionId: string = conversation.sessionId;
    expect(sessionId).toBe('session-1');
    expect(conversation.title).toBe('Order enquiry');
  });

  it('fails rather than returning a conversation without a sessionId', async () => {
    await expect(
      managerCreating({ title: 'Order enquiry' }).create({ userId: 1 }),
    ).rejects.toThrow('The created conversation has no sessionId');
  });
});
