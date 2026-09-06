import { act, render, screen, waitFor } from '@testing-library/react';
import type { RealtimeClient, RealtimeListener } from '@nocobase/app-client';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  realtime: undefined as RealtimeClient | undefined,
}));

vi.mock('@nocobase/app-client', () => ({
  realtimeClientToken: Symbol('realtime-client'),
  useService: (): RealtimeClient => {
    if (!testState.realtime)
      throw new Error('Test RealtimeClient is required.');
    return testState.realtime;
  },
}));

import {
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '../../../../plugins/app-plugin-notification-in-app/registry/in-app-ui/runtime.tsx';
import { fetchUnreadCount } from '../../../../plugins/app-plugin-notification-in-app/registry/in-app-ui/api.ts';

vi.mock(
  '../../../../plugins/app-plugin-notification-in-app/registry/in-app-ui/api.ts',
  () => ({ fetchUnreadCount: vi.fn() }),
);

function InboxStatus(): ReactElement {
  const inbox = useNotificationInAppRuntime();
  return <span>{`${inbox.unreadCount}:${inbox.revision}`}</span>;
}

describe('NotificationInAppProvider', () => {
  it('refetches durable state after a realtime invalidation event', async () => {
    const unreadCount = vi.mocked(fetchUnreadCount);
    unreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    let realtimeListener: RealtimeListener<unknown> | undefined;
    testState.realtime = {
      connected: true,
      subscribe: vi.fn((topic, listener) => {
        expect(topic).toBe(IN_APP_NOTIFICATION_REALTIME_TOPIC);
        realtimeListener = listener as RealtimeListener<unknown>;
        return vi.fn();
      }),
      onOpen: vi.fn(() => vi.fn()),
      onError: vi.fn(() => vi.fn()),
      reconnect: vi.fn(),
      close: vi.fn(),
    };

    render(
      <NotificationInAppProvider>
        <InboxStatus />
      </NotificationInAppProvider>,
    );

    await screen.findByText('2:0');

    act(() => {
      realtimeListener?.({
        type: 'event',
        topic: IN_APP_NOTIFICATION_REALTIME_TOPIC,
        payload: { kind: 'inbox.changed' },
        publishedAt: '2026-08-27T00:00:00.000Z',
      });
    });

    await waitFor(() => expect(screen.getByText('5:1')).toBeInTheDocument());
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });
});
