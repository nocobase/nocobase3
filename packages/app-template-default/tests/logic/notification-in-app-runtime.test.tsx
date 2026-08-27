import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AppClientRoot } from '@nocobase/app-client';
import type {
  AppClient,
  RealtimeClient,
  RealtimeEvent,
  RealtimeListener,
} from '@nocobase/app-sdk';

import {
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '../../registry/nocobase-notification/in-app/runtime.tsx';
import { fetchUnreadCount } from '../../registry/nocobase-notification/in-app/api.ts';

vi.mock('../../registry/nocobase-notification/in-app/api.ts', () => ({
  fetchUnreadCount: vi.fn(),
}));

function InboxStatus(): ReactElement {
  const inbox = useNotificationInAppRuntime();
  return <span>{`${inbox.unreadCount}:${inbox.revision}`}</span>;
}

describe('NotificationInAppProvider', () => {
  it('refreshes the inbox after a realtime invalidation event', async () => {
    const unreadCount = vi.mocked(fetchUnreadCount);
    unreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    let realtimeListener:
      RealtimeListener<{ readonly kind?: unknown }> | undefined;
    const realtime: RealtimeClient = {
      connected: true,
      subscribe: vi.fn((topic, listener) => {
        expect(topic).toBe(IN_APP_NOTIFICATION_REALTIME_TOPIC);
        realtimeListener = listener as RealtimeListener<{
          readonly kind?: unknown;
        }>;
        return vi.fn();
      }),
      onOpen: vi.fn(() => vi.fn()),
      refreshSession: vi.fn(),
      close: vi.fn(),
    };
    const client: AppClient = {
      realtime,
      request: vi.fn(),
    };

    render(
      <AppClientRoot
        config={{
          client,
          refine: { routerProvider: {} },
          routes: (
            <NotificationInAppProvider>
              <InboxStatus />
            </NotificationInAppProvider>
          ),
        }}
      />,
    );

    await screen.findByText('2:0');

    act(() => {
      realtimeListener?.({
        type: 'event',
        topic: IN_APP_NOTIFICATION_REALTIME_TOPIC,
        payload: { kind: 'inbox.changed' },
        publishedAt: '2026-08-27T00:00:00.000Z',
      } satisfies RealtimeEvent<{ readonly kind: string }>);
    });

    await waitFor(() => expect(screen.getByText('5:1')).toBeInTheDocument());
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });
});
