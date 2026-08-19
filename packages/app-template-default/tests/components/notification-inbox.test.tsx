import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { NotificationInboxPage } from '../../registry/notification/inbox/page.tsx';
import { NotificationInboxProvider } from '../../registry/notification/inbox/runtime.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('notification Inbox page', () => {
  it('renders HTTP state and optimistically reads an item before reconciling', async () => {
    vi.stubGlobal('WebSocket', QuietWebSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/unread-count')) return json({ count: 1 });
        if (url.endsWith('/csrf')) return json({ token: 'csrf-token' });
        if (init?.method === 'POST') {
          return json({ data: { ...itemFixture(), readAt: '2026-08-20T00:01:00.000Z', version: 2 } });
        }
        return json({ data: [itemFixture()] });
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationInboxProvider>
          <NotificationInboxPage />
        </NotificationInboxProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Approval request assigned')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/notifications/inbox/item-1', expect.objectContaining({ method: 'POST' })));
  });
});

class QuietWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  readonly readyState = QuietWebSocket.OPEN;

  constructor(_url: string) {}

  addEventListener(_type: string, _listener: EventListener): void {}
  send(_data: string): void {}
  close(): void {}
}

function itemFixture(): object {
  return {
    id: 'item-1',
    deliveryId: 'delivery-1',
    notificationId: 'notification-1',
    channel: 'in-app',
    title: 'Approval request assigned',
    body: 'A purchase request is waiting for review.',
    actionUrl: '/requests/1',
    createdAt: '2026-08-20T00:00:00.000Z',
    version: 1,
  };
}

function json(value: object, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
