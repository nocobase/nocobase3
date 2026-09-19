import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';
import {
  getManagedConversationMessages,
  listManagedConversations,
} from '../client/conversation-center-service.js';

describe('Conversation center API adapter', () => {
  it('requests only the management list with pagination and cancellation', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ rows: [], count: 0, page: 2, pageSize: 30 });
    const api = { request } as unknown as ApiClient;
    const signal = new AbortController().signal;
    await listManagedConversations(api, {
      keyword: 'Planning',
      page: 2,
      signal,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      path: 'ai/aiConversations:listAll',
      method: 'GET',
      query: { keyword: 'Planning', page: 2, pageSize: 30 },
      signal,
    });
  });

  it('reuses chat history conversion and never requests read-state changes', async () => {
    const request = vi.fn().mockResolvedValue({
      rows: [
        {
          key: '3',
          role: 'ellis',
          content: {
            messageId: '3',
            content: 'Answer',
            reasoning: { content: 'Reasoning' },
            tool_calls: [
              {
                id: 'tool-1',
                name: 'search',
                args: '{"query":"test"}',
                status: 'success',
                content: 'Found',
              },
            ],
          },
        },
        { key: '2', role: 'system', content: { content: 'Internal' } },
        {
          key: '1',
          role: 'user',
          content: { messageId: '1', content: 'Question' },
        },
      ],
      hasMore: true,
      cursor: '1',
    });
    const api = { request } as unknown as ApiClient;
    const result = await getManagedConversationMessages(api, 'session-a', {
      cursor: '4',
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      path: 'ai/aiConversations:getAllMessages',
      method: 'GET',
      query: { sessionId: 'session-a', cursor: '4' },
    });
    expect(result.messages.map(({ id }) => id)).toEqual(['1', '3']);
    expect(result.messages[1].parts).toEqual(
      expect.arrayContaining([
        { type: 'reasoning', text: 'Reasoning', state: 'done' },
        expect.objectContaining({
          type: 'dynamic-tool',
          toolName: 'search',
          input: { query: 'test' },
        }),
      ]),
    );
    expect(result).toMatchObject({ hasMore: true, cursor: '1' });
  });
});
