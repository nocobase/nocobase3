// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createPortalLiveProvider, type PortalLiveFrame, type PortalLiveSocket } from '../../registry/portal-live/client/index.ts';

class FakeSocket implements PortalLiveSocket {
  sent: PortalLiveFrame[] = [];
  private messageListeners = new Set<(frame: PortalLiveFrame) => void>();
  private closeListeners = new Set<() => void>();
  send(frame: PortalLiveFrame): void { this.sent.push(frame); }
  close(): void { for (const listener of this.closeListeners) listener(); }
  onMessage(listener: (frame: PortalLiveFrame) => void): () => void { this.messageListeners.add(listener); return () => this.messageListeners.delete(listener); }
  onClose(listener: () => void): () => void { this.closeListeners.add(listener); return () => this.closeListeners.delete(listener); }
  emit(frame: PortalLiveFrame): void { for (const listener of this.messageListeners) listener(frame); }
}

describe('Portal Live client provider', () => {
  it('subscribes, forwards events, and refuses client publishing', () => {
    const socket = new FakeSocket();
    const received: string[] = [];
    const provider = createPortalLiveProvider({ connect: () => socket });
    const subscription = provider.subscribe({ channel: 'notifications/inbox', callback: (event) => received.push(event.type) });
    socket.emit({ version: 1, type: 'event', subscriptionId: subscription.id, event: { version: 1, streamId: 'stream-1', eventId: 'event-1', sequence: 1, channel: 'notifications/inbox', type: 'created', occurredAt: '2026-08-19T00:00:00.000Z', payload: { ids: ['item-1'] } } });

    expect(received).toEqual(['created']);
    expect(() => provider.publish()).toThrow('publishing is unavailable');
    provider.unsubscribe(subscription);
    expect(socket.sent.at(-1)).toMatchObject({ type: 'unsubscribe', subscriptionId: subscription.id });
  });

  it('requests resynchronization when the server reports a replay gap', () => {
    const socket = new FakeSocket();
    let resync = 0;
    createPortalLiveProvider({ connect: () => socket, onResyncRequired: () => resync++ });
    socket.emit({ version: 1, type: 'resync_required', streamId: 'stream-1', sequence: 8 });
    expect(resync).toBe(1);
  });
});
