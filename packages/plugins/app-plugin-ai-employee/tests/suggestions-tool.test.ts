import { describe, expect, it, vi } from 'vitest';

import suggestions from '../server/ai/tools/suggestions.js';

describe('suggestions tool', () => {
  it('stores the selected suggestion on the interrupted message', async () => {
    const toolCalls = [
      {
        id: 'tool-call-1',
        name: 'suggestions',
        args: { options: ['Draft email'] },
      },
    ];
    const findOne = vi.fn().mockResolvedValue({ toolCalls });
    const update = vi.fn().mockResolvedValue(1);

    await expect(
      suggestions.invoke(
        {
          state: { messageId: 'message-1' },
          repositories: { aiMessages: { findOne, update } },
        } as any,
        { options: ['Draft email'], option: 'Draft email' },
        { toolCallId: 'tool-call-1' } as any,
      ),
    ).resolves.toEqual({ status: 'success', content: 'Draft email' });

    expect(findOne).toHaveBeenCalledWith({
      filter: { messageId: 'message-1' },
    });
    expect(update).toHaveBeenCalledWith({
      filter: { messageId: 'message-1' },
      values: {
        toolCalls: [
          expect.objectContaining({
            id: 'tool-call-1',
            selectedSuggestion: 'Draft email',
          }),
        ],
      },
    });
  });
});
