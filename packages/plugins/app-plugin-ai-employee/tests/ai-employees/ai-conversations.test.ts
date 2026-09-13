import { describe, expect, it, vi } from 'vitest';
import { AIConversationsManager } from '../../server/manager/ai-conversations-manager.js';

describe('AIConversationsManager', () => {
  it('loads only messages that belong to the requested session', async () => {
    const findMessages = vi.fn().mockResolvedValue([]);
    const manager = new AIConversationsManager(
      {
        toolsManager: { listTools: vi.fn().mockResolvedValue([]) },
        llmProviderManager: { llmProviders: new Map() },
      } as any,
      {
        aiConversations: {
          findOne: vi.fn().mockResolvedValue({ sessionId: 'session-a' }),
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn(),
        },
        aiMessages: { find: findMessages },
        aiToolMessages: { find: vi.fn().mockResolvedValue([]) },
      } as any,
    );

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

  it('creates and resolves chat conversations only', async () => {
    const create = vi.fn().mockResolvedValue({ sessionId: 'chat' });
    const findOne = vi.fn().mockResolvedValue(null);
    const manager = new AIConversationsManager(
      {} as any,
      {
        aiConversations: { create, findOne },
      } as any,
    );

    await manager.create({
      userId: 'user-1',
      aiEmployee: { username: 'atlas' },
    });

    await manager.create({ userId: 'user-1' });
    await expect(
      manager.getConversation({
        sessionId: 'historical-task',
        userId: 'user-1',
      }),
    ).resolves.toBeNull();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ category: 'chat' }),
      }),
      undefined,
    );
    expect(findOne).toHaveBeenCalledWith({
      filter: { sessionId: 'historical-task', category: 'chat' },
    });
  });
});
