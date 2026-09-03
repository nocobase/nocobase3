import { describe, expect, it, vi } from 'vitest';
import type {
  AppClient,
  RealtimeClient,
  RealtimeListener,
} from '@nocobase/app-client';

import { IN_APP_NOTIFICATION_REALTIME_TOPIC } from '../shared/realtime.js';
import {
  subscribeToInboxInvalidations,
  type InboxFocusTarget,
} from '../registry/in-app-ui/subscription.js';

describe('in-app notification Registry subscription', () => {
  it('refreshes after subscription recovery, valid events, and focus', () => {
    let eventListener: RealtimeListener<unknown> | undefined;
    let subscribedListener: (() => void) | undefined;
    let focusListener: EventListener | undefined;
    const unsubscribeEvent = vi.fn();
    const unsubscribeSubscribed = vi.fn();
    const realtime: RealtimeClient = {
      connected: true,
      subscribe: vi.fn((topic, listener) => {
        expect(topic).toBe(IN_APP_NOTIFICATION_REALTIME_TOPIC);
        eventListener = listener as RealtimeListener<unknown>;
        return unsubscribeEvent;
      }),
      onOpen: vi.fn(() => vi.fn()),
      onSubscribed: vi.fn((topic, listener) => {
        expect(topic).toBe(IN_APP_NOTIFICATION_REALTIME_TOPIC);
        subscribedListener = listener;
        return unsubscribeSubscribed;
      }),
      refreshSession: vi.fn(),
      close: vi.fn(),
    };
    const client = createClient(realtime);
    const target: InboxFocusTarget = {
      addEventListener: vi.fn((_type, listener) => {
        focusListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const refresh = vi.fn();

    const cleanup = subscribeToInboxInvalidations(client, target, refresh);

    subscribedListener?.();
    eventListener?.({
      type: 'event',
      topic: IN_APP_NOTIFICATION_REALTIME_TOPIC,
      payload: { kind: 'unrelated' },
      publishedAt: '2026-09-02T00:00:00.000Z',
    });
    eventListener?.({
      type: 'event',
      topic: IN_APP_NOTIFICATION_REALTIME_TOPIC,
      payload: { kind: 'inbox.changed' },
      publishedAt: '2026-09-02T00:00:01.000Z',
    });
    focusListener?.(new Event('focus'));

    expect(refresh).toHaveBeenCalledTimes(3);

    cleanup();

    expect(target.removeEventListener).toHaveBeenCalledWith('focus', refresh);
    expect(unsubscribeEvent).toHaveBeenCalledOnce();
    expect(unsubscribeSubscribed).toHaveBeenCalledOnce();
  });
});

function createClient(realtime: RealtimeClient): AppClient {
  return {
    realtime,
    request: vi.fn(),
    stream: vi.fn(),
  };
}
