import { describe, expect, it, vi } from 'vitest';
import type { RealtimeClient, RealtimeListener } from '@nocobase/app-client';

import { IN_APP_NOTIFICATION_REALTIME_TOPIC } from '../shared/realtime.js';
import {
  subscribeToInboxInvalidations,
  type InboxFocusTarget,
} from '../client/subscription.js';

describe('in-app notification Client subscription', () => {
  it('refreshes after connection recovery, valid events, and focus', () => {
    let eventListener: RealtimeListener<unknown> | undefined;
    let openListener: (() => void) | undefined;
    let focusListener: EventListener | undefined;
    const unsubscribeEvent = vi.fn();
    const unsubscribeOpen = vi.fn();
    const realtime: RealtimeClient = {
      connected: true,
      subscribe: vi.fn((topic, listener) => {
        expect(topic).toBe(IN_APP_NOTIFICATION_REALTIME_TOPIC);
        eventListener = listener as RealtimeListener<unknown>;
        return unsubscribeEvent;
      }),
      onOpen: vi.fn((listener) => {
        openListener = listener;
        return unsubscribeOpen;
      }),
      reconnect: vi.fn(),
      onError: vi.fn(),
      close: vi.fn(),
    };
    const target: InboxFocusTarget = {
      addEventListener: vi.fn((_type, listener) => {
        focusListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const refresh = vi.fn();

    const cleanup = subscribeToInboxInvalidations(realtime, target, refresh);

    openListener?.();
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
    expect(unsubscribeOpen).toHaveBeenCalledOnce();
  });
});
