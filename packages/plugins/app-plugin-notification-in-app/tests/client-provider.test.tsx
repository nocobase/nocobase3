import type { ApiClient, RealtimeClient } from '@nocobase/app-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appClient: {
    request: vi.fn(),
    stream: vi.fn(),
    repository: vi.fn(),
  } satisfies ApiClient,
  realtime: {
    connected: false,
    subscribe: vi.fn(),
    onOpen: vi.fn(),
    onError: vi.fn(),
    reconnect: vi.fn(),
    close: vi.fn(),
  } satisfies RealtimeClient,
  cleanup: vi.fn(),
  fetchUnreadCount: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useService: (token: unknown) =>
      token === actual.realtimeClientToken ? mocks.realtime : mocks.appClient,
  };
});

vi.mock('../client/api.js', () => ({
  fetchUnreadCount: mocks.fetchUnreadCount,
}));

vi.mock('../client/subscription.js', () => ({
  subscribeToInboxInvalidations: mocks.subscribe,
}));

import { NotificationInAppProvider } from '../client/components/notification-in-app-provider.js';
import { useNotificationInAppRuntime } from '../client/notification-in-app-runtime.js';

function RuntimeConsumer(): ReactElement {
  const runtime = useNotificationInAppRuntime();
  return (
    <button onClick={runtime.refresh}>
      Refresh inbox ({runtime.unreadCount})
    </button>
  );
}

describe('in-app notification Client Provider', () => {
  it('loads unread state, refreshes on invalidation, and cleans up', async () => {
    mocks.fetchUnreadCount.mockResolvedValue(4);
    mocks.subscribe.mockReturnValue(mocks.cleanup);

    const view = render(
      <NotificationInAppProvider>
        <RuntimeConsumer />
      </NotificationInAppProvider>,
    );

    expect(
      await screen.findByRole('button', { name: 'Refresh inbox (4)' }),
    ).toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledWith(
      mocks.realtime,
      window,
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox (4)' }));
    await waitFor(() =>
      expect(mocks.fetchUnreadCount).toHaveBeenCalledTimes(2),
    );

    view.unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
