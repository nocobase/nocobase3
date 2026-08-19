import type { PortalLiveCursor, PortalLiveEvent } from '../server/index.js';

export interface PortalLiveSubscriptionOptions {
  readonly channel: string;
  readonly types?: readonly string[];
  readonly params?: Record<string, unknown>;
  readonly callback: (event: PortalLiveEvent) => void;
}

export interface PortalLiveSubscription {
  readonly id: string;
  unsubscribe(): void;
}

export interface PortalLiveSocket {
  send(frame: PortalLiveFrame): void;
  close(): void;
  onMessage(listener: (frame: PortalLiveFrame) => void): () => void;
  onClose(listener: () => void): () => void;
}

export type PortalLiveFrame =
  | { readonly version: 1; readonly type: 'auth_ok'; readonly streamId: string }
  | { readonly version: 1; readonly type: 'subscribed' | 'unsubscribed'; readonly subscriptionId: string }
  | { readonly version: 1; readonly type: 'event'; readonly subscriptionId: string; readonly event: PortalLiveEvent }
  | { readonly version: 1; readonly type: 'resync_required'; readonly streamId: string; readonly sequence: number }
  | { readonly version: 1; readonly type: 'auth'; readonly token?: string }
  | { readonly version: 1; readonly type: 'subscribe'; readonly subscriptionId: string; readonly channel: string; readonly types?: readonly string[]; readonly params?: Record<string, unknown>; readonly cursor?: PortalLiveCursor }
  | { readonly version: 1; readonly type: 'unsubscribe'; readonly subscriptionId: string };

export interface PortalLiveProvider {
  subscribe(options: PortalLiveSubscriptionOptions): PortalLiveSubscription;
  unsubscribe(subscription: PortalLiveSubscription): void;
  publish(): never;
}

export function createPortalLiveProvider(options: { readonly connect: () => PortalLiveSocket; readonly token?: string; readonly onResyncRequired?: () => void }): PortalLiveProvider {
  let socket = options.connect();
  let streamId: string | undefined;
  let cursor: PortalLiveCursor | undefined;
  const subscriptions = new Map<string, PortalLiveSubscriptionOptions>();
  const listeners = new Map<string, () => void>();
  const attach = (): void => {
    listeners.set('message', socket.onMessage(handleFrame));
    listeners.set('close', socket.onClose(() => {
      socket = options.connect();
      attach();
      for (const [id, subscription] of subscriptions) socket.send({ version: 1, type: 'subscribe', subscriptionId: id, channel: subscription.channel, types: subscription.types, params: subscription.params, cursor });
    }));
    if (options.token) socket.send({ version: 1, type: 'auth', token: options.token });
  };
  const handleFrame = (frame: PortalLiveFrame): void => {
    if (frame.type === 'auth_ok') streamId = frame.streamId;
    if (frame.type === 'event') {
      cursor = { streamId: frame.event.streamId, sequence: frame.event.sequence };
      subscriptions.get(frame.subscriptionId)?.callback(frame.event);
    }
    if (frame.type === 'resync_required') {
      cursor = { streamId: frame.streamId, sequence: frame.sequence };
      options.onResyncRequired?.();
    }
  };
  attach();
  return {
    subscribe(subscription): PortalLiveSubscription {
      const id = `subscription-${Math.random().toString(36).slice(2)}`;
      subscriptions.set(id, subscription);
      socket.send({ version: 1, type: 'subscribe', subscriptionId: id, channel: subscription.channel, types: subscription.types, params: subscription.params, cursor });
      return { id, unsubscribe: () => { subscriptions.delete(id); socket.send({ version: 1, type: 'unsubscribe', subscriptionId: id }); } };
    },
    unsubscribe(subscription): void { subscription.unsubscribe(); },
    publish(): never { throw new Error('Portal Live client publishing is unavailable.'); },
  };
}
