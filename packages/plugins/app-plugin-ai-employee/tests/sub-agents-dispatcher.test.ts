import { describe, expect, it, vi } from 'vitest';

import { SubAgentsDispatcher } from '../server/managers/sub-agents/dispatcher.js';

const unusedDependencies = {
  aiEmployeesManager: {} as never,
  builtInManager: {} as never,
  llmStreamCachedManager: {} as never,
  knowledgeBaseManager: {} as never,
  workContextHandler: {} as never,
  documentLoaders: {} as never,
};

describe('SubAgentsDispatcher direct dependencies', () => {
  it('uses the injected conversation manager when rejecting an interrupted sub-agent', async () => {
    const getUserDecisions = vi.fn().mockResolvedValue({
      decisions: [{ type: 'reject' }],
    });
    const dispatcher = new SubAgentsDispatcher({
      repositories: {
        aiConversations: {
          findOne: vi.fn().mockResolvedValue({ sessionId: 'main-session' }),
        },
        aiToolMessages: {
          findOne: vi.fn().mockResolvedValue({ messageId: 'main-message' }),
          update: vi.fn().mockResolvedValue(1),
        },
        aiMessages: {
          findOne: vi
            .fn()
            .mockResolvedValueOnce({
              metadata: {
                subAgentConversations: [{ sessionId: 'sub-session' }],
              },
            })
            .mockResolvedValueOnce({
              sessionId: 'sub-session',
              messageId: 'sub-message',
            }),
        },
      } as never,
      aiConversationsManager: { getUserDecisions } as never,
      ...unusedDependencies,
    });

    await expect(
      dispatcher.reject('main-session', {
        auth: { user: { id: 'user-1' } },
      } as never),
    ).resolves.toEqual({ decisions: [{ type: 'reject' }] });
    expect(getUserDecisions).toHaveBeenCalledWith('sub-message');
  });
});
