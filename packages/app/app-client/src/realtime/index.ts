export interface RealtimeEvent<Payload = unknown> {
  readonly type: 'event';
  readonly topic: string;
  readonly payload: Payload;
  readonly publishedAt: string;
}

export type RealtimeListener<Payload> = (event: RealtimeEvent<Payload>) => void;

export interface RealtimeClient {
  readonly connected: boolean;
  subscribe<Payload>(
    topic: string,
    listener: RealtimeListener<Payload>,
  ): () => void;
  onOpen(listener: () => void): () => void;
  onSubscribed?(topic: string, listener: () => void): () => void;
  refreshSession(): void;
  close(): void;
}

export interface RealtimeClientOptions {
  readonly pingInterval?: number;
  readonly reconnectMaxInterval?: number;
  readonly resolveUrl: () => string | undefined;
}

interface RealtimeWireMessage {
  readonly id?: string;
  readonly type?: string;
  readonly topic?: string;
  readonly payload?: unknown;
  readonly publishedAt?: string;
  readonly subscriptionId?: string;
}

type UntypedRealtimeListener = RealtimeListener<unknown>;

export function createRealtimeClient(
  options: RealtimeClientOptions,
): RealtimeClient {
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectCount = 0;
  let subscriptionRequestSequence = 0;
  let manuallyClosed = false;
  const openListeners = new Set<() => void>();
  const pendingSubscriptionIds = new Map<string, string>();
  const subscribedListeners = new Map<string, Set<() => void>>();
  const topicListeners = new Map<string, Set<UntypedRealtimeListener>>();

  const client: RealtimeClient = {
    get connected(): boolean {
      return socket?.readyState === 1;
    },

    subscribe<Payload>(
      topic: string,
      listener: RealtimeListener<Payload>,
    ): () => void {
      validateRealtimeTopic(topic);
      const listeners =
        topicListeners.get(topic) ?? new Set<UntypedRealtimeListener>();
      const wasEmpty = listeners.size === 0;
      listeners.add(listener as UntypedRealtimeListener);
      topicListeners.set(topic, listeners);

      if (wasEmpty && client.connected) {
        sendSubscription(topic);
      } else if (!socket) {
        connect();
      }

      return (): void => {
        listeners.delete(listener as UntypedRealtimeListener);
        if (listeners.size > 0) return;
        topicListeners.delete(topic);
        pendingSubscriptionIds.delete(topic);
        send({ type: 'unsubscribe', topic });
        if (topicListeners.size === 0) client.close();
      };
    },

    onOpen(listener: () => void): () => void {
      openListeners.add(listener);
      return (): void => {
        openListeners.delete(listener);
      };
    },

    onSubscribed(topic: string, listener: () => void): () => void {
      validateRealtimeTopic(topic);
      const listeners = subscribedListeners.get(topic) ?? new Set<() => void>();
      listeners.add(listener);
      subscribedListeners.set(topic, listeners);
      return (): void => {
        listeners.delete(listener);
        if (listeners.size === 0) subscribedListeners.delete(topic);
      };
    },

    refreshSession(): void {
      if (topicListeners.size === 0) return;
      manuallyClosed = false;
      reconnectCount = 0;
      stopPing();
      socket?.close();
      socket = undefined;
      connect();
    },

    close(): void {
      manuallyClosed = true;
      clearReconnectTimer();
      stopPing();
      pendingSubscriptionIds.clear();
      socket?.close();
      socket = undefined;
    },
  };

  function connect(): void {
    if (typeof WebSocket === 'undefined') return;
    if (socket?.readyState === WebSocket.CONNECTING || client.connected) return;
    const resolvedUrl = options.resolveUrl();
    if (!resolvedUrl) return;
    const websocketUrl = toWebSocketUrl(resolvedUrl);
    if (!websocketUrl) return;

    manuallyClosed = false;
    clearReconnectTimer();
    const nextSocket = new WebSocket(websocketUrl);
    socket = nextSocket;

    nextSocket.onopen = (): void => {
      if (socket !== nextSocket) return;
      reconnectCount = 0;
      startPing();
      for (const topic of topicListeners.keys()) sendSubscription(topic);
      for (const listener of openListeners) {
        notifyListener(listener, 'Realtime open listener failed.');
      }
    };
    nextSocket.onmessage = (event: MessageEvent<unknown>): void => {
      if (socket !== nextSocket || typeof event.data !== 'string') return;
      let message: RealtimeWireMessage;
      try {
        message = JSON.parse(event.data) as RealtimeWireMessage;
      } catch (error) {
        console.warn('Unable to parse NocoBase realtime message.', error);
        return;
      }
      if (isRealtimeSubscribed(message)) {
        if (pendingSubscriptionIds.get(message.topic) !== message.id) return;
        pendingSubscriptionIds.delete(message.topic);
        for (const listener of subscribedListeners.get(message.topic) ?? []) {
          notifyListener(
            listener,
            `Realtime subscribed listener for topic "${message.topic}" failed.`,
          );
        }
        return;
      }
      if (!isRealtimeEvent(message)) return;
      for (const listener of topicListeners.get(message.topic) ?? []) {
        notifyListener(
          () => listener(message),
          `Realtime listener for topic "${message.topic}" failed.`,
        );
      }
    };
    nextSocket.onerror = (): void => {
      // The close event owns reconnection because browsers do not expose a
      // useful WebSocket error reason.
    };
    nextSocket.onclose = (): void => {
      if (socket !== nextSocket) return;
      socket = undefined;
      stopPing();
      pendingSubscriptionIds.clear();
      if (!manuallyClosed && topicListeners.size > 0) scheduleReconnect();
    };
  }

  function send(message: Record<string, unknown>): boolean {
    if (!client.connected) return false;
    socket?.send(JSON.stringify(message));
    return true;
  }

  function sendSubscription(topic: string): void {
    subscriptionRequestSequence += 1;
    const id = `subscribe:${subscriptionRequestSequence}:${topic}`;
    pendingSubscriptionIds.set(topic, id);
    if (!send({ type: 'subscribe', id, topic })) {
      pendingSubscriptionIds.delete(topic);
    }
  }

  function scheduleReconnect(): void {
    clearReconnectTimer();
    const maxInterval = options.reconnectMaxInterval ?? 30_000;
    const delay = Math.min(
      maxInterval,
      1_000 * 2 ** Math.min(reconnectCount, 5),
    );
    reconnectCount += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function startPing(): void {
    stopPing();
    pingTimer = setInterval(
      () => send({ type: 'ping' }),
      options.pingInterval ?? 300_000,
    );
  }

  function stopPing(): void {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = undefined;
  }

  return client;
}

function notifyListener(listener: () => void, message: string): void {
  try {
    listener();
  } catch (error) {
    console.error(message, error);
  }
}

function toWebSocketUrl(value: string): string | undefined {
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (!absolute && typeof window === 'undefined') return undefined;
  const base = typeof window === 'undefined' ? undefined : window.location.href;
  const url = new URL(value, base);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  return url.toString();
}

function validateRealtimeTopic(topic: string): void {
  if (!/^[a-z][a-z0-9:-]{0,127}$/.test(topic)) {
    throw new Error('Realtime topic is invalid.');
  }
}

function isRealtimeEvent(
  message: RealtimeWireMessage,
): message is RealtimeEvent<unknown> {
  return (
    message.type === 'event' &&
    typeof message.topic === 'string' &&
    typeof message.publishedAt === 'string'
  );
}

function isRealtimeSubscribed(
  message: RealtimeWireMessage,
): message is RealtimeWireMessage & {
  readonly type: 'subscribed';
  readonly id: string;
  readonly topic: string;
  readonly subscriptionId: string;
} {
  return (
    message.type === 'subscribed' &&
    typeof message.id === 'string' &&
    typeof message.topic === 'string' &&
    typeof message.subscriptionId === 'string'
  );
}
