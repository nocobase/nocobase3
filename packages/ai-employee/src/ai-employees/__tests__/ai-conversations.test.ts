import { describe, expect, it, vi } from 'vitest';
import { AIConversationsManager } from '../ai-conversations.js';

describe('AIConversationsManager', () => {
  it('loads only messages that belong to the requested session', async () => {
    const findMessages = vi.fn().mockResolvedValue([]);
    const manager = new AIConversationsManager({
      repositories: {
        aiConversations: {
          findOne: vi.fn().mockResolvedValue({ sessionId: 'session-a' }),
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn(),
        },
        aiMessages: { find: findMessages },
        aiToolMessages: { find: vi.fn().mockResolvedValue([]) },
      },
      ai: {
        toolsManager: { listTools: vi.fn().mockResolvedValue([]) },
        llmProviderManager: { llmProviders: new Map() },
      },
    } as any);

    await manager.getMessages({
      userId: 'user-1',
      sessionId: 'session-a',
      paginate: false,
    });

    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          sessionId: 'session-a',
          role: { $notIn: ['tool'] },
        },
      }),
    );
  });
});
