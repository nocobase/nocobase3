import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  type RealtimeClient,
  type RealtimeListener,
} from '@nocobase/app-client';
import { useMailWorkspaceData } from '../client/hooks/use-mail-workspace-data.js';
import type {
  MailClient,
  MailMessage,
  MailPage,
  MailAccountView,
} from '../client/mail-client.js';

const transport = vi.hoisted(() => ({
  listener: undefined as RealtimeListener<unknown> | undefined,
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const realtime: Pick<RealtimeClient, 'subscribe' | 'onOpen'> = {
    subscribe: (_topic, listener) => {
      transport.listener = listener;
      return () => {
        transport.listener = undefined;
      };
    },
    onOpen: () => () => undefined,
  };
  return { ...actual, useService: () => realtime };
});

function message(id: string): MailMessage {
  return {
    id,
    accountId: 'account',
    providerMessageId: id,
    subject: id,
    text: id,
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    references: [],
    folderIds: [],
    labelIds: [],
    attachments: [],
    read: true,
    starred: false,
    draft: false,
    hasAttachments: false,
  };
}

function setup() {
  const listMessages = vi
    .fn<MailClient['listMessages']>()
    .mockResolvedValue({ items: [message('selected')] });
  const getMessage = vi
    .fn<MailClient['getMessage']>()
    .mockResolvedValue(message('selected'));
  const listConversationMessages = vi
    .fn<MailClient['listConversationMessages']>()
    .mockResolvedValue({ items: [] });
  const mail = {
    listMessages,
    getMessage,
    listConversationMessages,
  } as unknown as MailClient;
  const options = {
    mail,
    accounts: [{ id: 'account', status: 'active' }] as MailAccountView[],
    messageQuery: { limit: 50 },
    reloadVersion: 0,
    requestError: vi.fn(),
    setError: vi.fn(),
    onFocus: vi.fn(),
  };
  const hook = renderHook(() => useMailWorkspaceData(options));
  return {
    ...hook,
    listMessages,
    getMessage,
    listConversationMessages,
    requestError: options.requestError,
  };
}

function invalidate(): void {
  act(() =>
    transport.listener?.({ payload: { kind: 'mail.changed' } } as Parameters<
      RealtimeListener<unknown>
    >[0]),
  );
}

describe('workspace data invalidation', () => {
  beforeEach(() => {
    transport.listener = undefined;
  });

  it('keeps a reader when new messages push its row off the current page', async () => {
    const { result, listMessages } = setup();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => result.current.selectMessage(message('selected')));
    await waitFor(() => expect(result.current.conversation).toHaveLength(1));
    listMessages.mockResolvedValue({ items: [message('new')] });
    invalidate();
    await waitFor(() => expect(result.current.messages[0]?.id).toBe('new'));
    expect(result.current.selected?.id).toBe('selected');
    expect(result.current.conversation[0]?.id).toBe('selected');
  });

  it('applies list changes when the selected detail was deleted remotely', async () => {
    const { result, listMessages, getMessage, requestError } = setup();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => result.current.selectMessage(message('selected')));
    await waitFor(() => expect(result.current.conversation).toHaveLength(1));
    listMessages.mockResolvedValue({ items: [message('remaining')] });
    getMessage.mockRejectedValue(
      new ApiClientError('not found', {
        status: 404,
        method: 'GET',
        url: '/mail/messages/selected',
      }),
    );
    invalidate();
    await waitFor(() =>
      expect(result.current.messages[0]?.id).toBe('remaining'),
    );
    expect(result.current.selected).toBeUndefined();
    expect(result.current.conversation).toHaveLength(0);
    expect(requestError).not.toHaveBeenCalled();
  });

  it('replays invalidations that arrive during a pending list request', async () => {
    const old = Promise.withResolvers<MailPage<MailMessage>>();
    const { result, listMessages } = setup();
    listMessages
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue({ items: [message('fresh')] });
    await waitFor(() => expect(listMessages).toHaveBeenCalledOnce());
    invalidate();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await act(async () => {
      old.resolve({ items: [message('old')] });
      await old.promise;
    });
    await waitFor(() => expect(result.current.messages[0]?.id).toBe('fresh'));
  });

  it('does not let a stale refresh erase newly loaded conversation pages', async () => {
    const old = Promise.withResolvers<MailPage<MailMessage>>();
    const { result, listConversationMessages } = setup();
    listConversationMessages.mockResolvedValueOnce({
      items: [message('latest')],
      nextCursor: 'older',
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() =>
      result.current.selectMessage({
        ...message('selected'),
        conversationId: 'thread',
      }),
    );
    await waitFor(() =>
      expect(result.current.conversationCursor).toBe('older'),
    );
    listConversationMessages
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({
        items: [message('oldest')],
        nextCursor: undefined,
      });
    invalidate();
    await waitFor(() =>
      expect(listConversationMessages).toHaveBeenCalledTimes(2),
    );
    act(() => result.current.loadMoreConversation());
    await waitFor(() => expect(result.current.conversation).toHaveLength(2));
    await act(async () => {
      old.resolve({ items: [message('stale')] });
      await old.promise;
    });
    expect(result.current.conversation.map((item) => item.id)).toEqual([
      'oldest',
      'latest',
    ]);
    expect(result.current.conversationCursor).toBeUndefined();
  });

  it('replays changes received while the selected conversation is still loading', async () => {
    const old = Promise.withResolvers<MailPage<MailMessage>>();
    const { result, listConversationMessages } = setup();
    listConversationMessages
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue({ items: [message('fresh-reply')] });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() =>
      result.current.selectMessage({
        ...message('selected'),
        conversationId: 'thread',
      }),
    );
    await waitFor(() =>
      expect(listConversationMessages).toHaveBeenCalledOnce(),
    );
    invalidate();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await act(async () => {
      old.resolve({ items: [message('old-reply')] });
      await old.promise;
    });
    await waitFor(() =>
      expect(result.current.conversation[0]?.id).toBe('fresh-reply'),
    );
  });

  it('refreshes an expanded conversation through provider-independent pagination', async () => {
    const { result, listConversationMessages } = setup();
    const items = Array.from({ length: 250 }, (_, index) =>
      message(`message-${index}`),
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    listConversationMessages.mockResolvedValueOnce({
      items: items.slice(200),
      nextCursor: '200',
    });
    act(() =>
      result.current.selectMessage({
        ...message('selected'),
        conversationId: 'thread',
      }),
    );
    await waitFor(() => expect(result.current.conversation).toHaveLength(50));
    for (const end of [200, 150, 100, 50]) {
      listConversationMessages.mockResolvedValueOnce({
        items: items.slice(end - 50, end),
        nextCursor: end === 50 ? undefined : String(end - 50),
      });
      act(() => result.current.loadMoreConversation());
      await waitFor(() =>
        expect(result.current.conversation).toHaveLength(300 - end),
      );
    }
    listConversationMessages
      .mockResolvedValueOnce({ items: items.slice(50), nextCursor: '50' })
      .mockResolvedValueOnce({ items: items.slice(0, 50) });
    invalidate();
    await waitFor(() =>
      expect(listConversationMessages).toHaveBeenCalledTimes(7),
    );
    await waitFor(() => expect(result.current.conversation).toEqual(items));
    expect(listConversationMessages).toHaveBeenLastCalledWith(
      'account',
      'thread',
      { cursor: '50', limit: 50 },
    );
  });
});
