import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ApiClient } from '@nocobase/app-client';
import type { PropsWithChildren, ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NotificationInAppRuntimeContext,
  type NotificationInAppRuntimeValue,
} from '../client/notification-in-app-runtime.js';
import type { InboxItem } from '../client/api.js';
import { NotificationInAppInbox } from '../client/components/notification-in-app-inbox.js';

interface ClientRequest {
  readonly path: string;
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly json?: Readonly<Record<string, unknown>>;
}

const mocks = vi.hoisted(() => {
  const request = vi.fn();
  const stream = vi.fn();
  const repository = vi.fn();
  return {
    request,
    stream,
    repository,
    apiClient: { request, stream, repository },
  };
});

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => mocks.apiClient satisfies ApiClient,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { readonly defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

describe('NotificationInAppInbox', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('IntersectionObserver', undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('filters unread notifications and renders the empty state', async () => {
    const allItems = [
      inboxItem('unread-1', 'Needs review'),
      inboxItem('read-1', 'Already read', true),
    ];
    const requests: string[] = [];
    mocks.request.mockImplementation(async ({ path }: ClientRequest) => {
      requests.push(path);
      return {
        data: path.includes('unreadOnly=true')
          ? allItems.filter((item) => !item.readAt)
          : allItems,
      };
    });

    renderInbox();
    expect(
      await screen.findByRole('heading', { name: 'Needs review' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Already read' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() =>
      expect(requests).toContain(
        'notifications/in-app?limit=25&unreadOnly=true',
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Already read' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Needs review' }),
    ).toBeInTheDocument();

    mocks.request.mockResolvedValue({ data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
  });

  it('loads the next page and removes duplicate records', async () => {
    const first = inboxItem('notice-1', 'First notice');
    const second = inboxItem('notice-2', 'Second notice');
    const requestedPaths: string[] = [];
    mocks.request.mockImplementation(async ({ path }: ClientRequest) => {
      requestedPaths.push(path);
      return path.includes('cursor=next-page')
        ? { data: [first, second] }
        : { data: [first], nextCursor: 'next-page' };
    });

    renderInbox();
    expect(
      await screen.findByRole('heading', { name: 'First notice' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(
      await screen.findByRole('heading', { name: 'Second notice' }),
    ).toBeInTheDocument();
    expect(requestedPaths).toEqual([
      'notifications/in-app?limit=25',
      'notifications/in-app?limit=25&cursor=next-page',
    ]);
    expect(
      screen.getAllByRole('heading', { name: 'First notice' }),
    ).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('No more messages');
  });

  it('updates one item, marks all read, and deletes with CSRF protection', async () => {
    let serverItems = [
      inboxItem('notice-1', 'First notice'),
      inboxItem('notice-2', 'Second notice'),
    ];
    const requests: ClientRequest[] = [];
    mocks.request.mockImplementation(async (request: ClientRequest) => {
      requests.push(request);
      if (request.path.startsWith('notifications/in-app?'))
        return { data: serverItems };
      if (request.path === 'notifications/in-app/csrf')
        return { token: 'csrf-token' };
      if (request.path === 'notifications/in-app/read-all') {
        serverItems = serverItems.map((item) => ({
          ...item,
          readAt: item.readAt ?? '2026-09-30T00:00:00.000Z',
        }));
        return { updated: serverItems.length };
      }
      const itemId = request.path.split('/').at(-1);
      const action = request.json?.action;
      const item = serverItems.find(({ id }) => id === itemId);
      if (!item) throw new Error(`Unknown inbox item ${itemId}`);
      if (action === 'delete') {
        serverItems = serverItems.filter(({ id }) => id !== itemId);
        return { data: item };
      }
      const updated = {
        ...item,
        readAt: action === 'read' ? '2026-09-30T00:00:00.000Z' : undefined,
      };
      serverItems = serverItems.map((candidate) =>
        candidate.id === itemId ? updated : candidate,
      );
      return { data: updated };
    });

    renderInbox();
    expect(
      await screen.findByRole('heading', { name: 'First notice' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark read' })[0]);
    expect(
      await screen.findByRole('button', { name: 'Mark unread' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({
          path: 'notifications/in-app/notice-1',
          method: 'POST',
          headers: { 'x-csrf-token': 'csrf-token' },
          json: { action: 'read' },
        }),
      ),
    );

    const markAllRead = screen.getByRole('button', { name: 'Mark all read' });
    fireEvent.click(markAllRead);
    await waitFor(() => expect(markAllRead).toBeDisabled());
    expect(requests).toContainEqual(
      expect.objectContaining({
        path: 'notifications/in-app/read-all',
        method: 'POST',
        headers: { 'x-csrf-token': 'csrf-token' },
        json: {},
      }),
    );

    const secondRow = screen
      .getByRole('heading', { name: 'Second notice' })
      .closest('article');
    if (!secondRow) throw new Error('Second notice row was not rendered');
    fireEvent.click(
      within(secondRow).getByRole('button', { name: 'Delete notification' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Second notice' }),
      ).not.toBeInTheDocument(),
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        path: 'notifications/in-app/notice-2',
        method: 'POST',
        headers: { 'x-csrf-token': 'csrf-token' },
        json: { action: 'delete' },
      }),
    );
  });

  it('shows an API error and retries the inbox load', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('Inbox offline'))
      .mockResolvedValue({ data: [] });

    renderInbox();
    expect(await screen.findByText('Inbox offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
  });
});

function renderInbox(): void {
  render(
    <TestRuntimeProvider>
      <NotificationInAppInbox />
    </TestRuntimeProvider>,
  );
}

function TestRuntimeProvider({ children }: PropsWithChildren): ReactElement {
  const [revision, setRevision] = useState(0);
  const value = useMemo<NotificationInAppRuntimeValue>(
    () => ({
      unreadCount: 2,
      revision,
      refresh: () => setRevision((current) => current + 1),
    }),
    [revision],
  );
  return (
    <NotificationInAppRuntimeContext.Provider value={value}>
      {children}
    </NotificationInAppRuntimeContext.Provider>
  );
}

function inboxItem(id: string, title: string, read = false): InboxItem {
  return {
    id,
    deliveryId: `delivery-${id}`,
    notificationId: `notification-${id}`,
    title,
    body: `${title} body`,
    ...(read ? { readAt: '2026-09-29T00:00:00.000Z' } : {}),
    createdAt: '2026-09-29T00:00:00.000Z',
  };
}
