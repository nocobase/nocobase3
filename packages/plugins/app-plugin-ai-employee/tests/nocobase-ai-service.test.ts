import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { NocoBaseAIService } from '../registry/nocobase-ai/services/nocobase-ai-service.ts';

function createClient(): {
  readonly client: AppClient;
  readonly request: ReturnType<typeof vi.fn<AppClient['request']>>;
  readonly stream: ReturnType<typeof vi.fn<AppClient['stream']>>;
} {
  const request = vi.fn<AppClient['request']>();
  const stream = vi.fn<AppClient['stream']>();
  return { client: { request, stream }, request, stream };
}

describe('NocoBaseAIService', () => {
  it('uses the App API client for resource actions', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce([{ username: 'atlas', nickname: 'Atlas' }]);
    const service = new NocoBaseAIService(client);

    await expect(service.listEmployees()).resolves.toEqual([
      { username: 'atlas', nickname: 'Atlas' },
    ]);
    expect(request).toHaveBeenCalledWith('ai/aiEmployees:listByUser', {
      method: 'GET',
    });
  });

  it('serializes query values and JSON request bodies', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    const service = new NocoBaseAIService(client);

    await service.listConversations('renewal risk');
    await service.updateConversationTitle('session/1', 'Weekly review');

    expect(request).toHaveBeenNthCalledWith(
      1,
      'ai/aiConversations:list?keyword=renewal+risk',
      { method: 'GET' },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'ai/aiConversations:update?sessionId=session%2F1',
      {
        method: 'PUT',
        body: JSON.stringify({ title: 'Weekly review' }),
      },
    );
  });

  it('preserves FormData for uploads', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce({ id: 'file-1', filename: 'notes.txt' });
    const service = new NocoBaseAIService(client);
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });

    await service.uploadFile(file);

    const init = request.mock.calls[0]?.[1];
    expect(request).toHaveBeenCalledWith(
      'ai/aiFiles:create',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('uses the App API client streaming transport', async () => {
    const { client, stream } = createClient();
    const responseBody = new ReadableStream<Uint8Array>();
    stream.mockResolvedValueOnce(responseBody);
    const service = new NocoBaseAIService(client);

    await expect(
      service.sendMessagesStream({ sessionId: 'session-1' }),
    ).resolves.toBe(responseBody);
    expect(stream).toHaveBeenCalledWith('ai/aiConversations:sendMessages', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session-1' }),
    });
  });
});
