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
  refreshSession(): void;
  close(): void;
}

export interface RealtimeClientOptions {
  readonly pingInterval?: number;
  readonly reconnectMaxInterval?: number;
  readonly resolveUrl: () => string | undefined;
}

interface RealtimeWireMessage {
  readonly type?: string;
  readonly topic?: string;
  readonly payload?: unknown;
  readonly publishedAt?: string;
}

type UntypedRealtimeListener = RealtimeListener<unknown>;

export function createRealtimeClient(
  options: RealtimeClientOptions,
): RealtimeClient {
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectCount = 0;
  let manuallyClosed = false;
  const openListeners = new Set<() => void>();
  const topicListeners = new Map<string, Set<UntypedRealtimeListener>>();

  const client: RealtimeClient = {
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
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

      return () => {
        listeners.delete(listener as UntypedRealtimeListener);
        if (listeners.size > 0) return;
        topicListeners.delete(topic);
        send({ type: 'unsubscribe', topic });
        if (topicListeners.size === 0) client.close();
      };
    },

    onOpen(listener: () => void): () => void {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },

    refreshSession() {
      if (topicListeners.size === 0) return;
      manuallyClosed = false;
      reconnectCount = 0;
      socket?.close();
      socket = undefined;
      connect();
    },

    close() {
      manuallyClosed = true;
      clearReconnectTimer();
      stopPing();
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

    nextSocket.onopen = () => {
      if (socket !== nextSocket) return;
      reconnectCount = 0;
      startPing();
      for (const topic of topicListeners.keys()) sendSubscription(topic);
      for (const listener of openListeners) listener();
    };
    nextSocket.onmessage = (event) => {
      if (socket !== nextSocket || typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as RealtimeWireMessage;
        if (!isRealtimeEvent(message)) return;
        for (const listener of topicListeners.get(message.topic) ?? []) {
          listener(message);
        }
      } catch (error) {
        console.warn('Unable to parse NocoBase realtime message.', error);
      }
    };
    nextSocket.onerror = () => {
      // The close event owns reconnection because browsers do not expose a
      // useful WebSocket error reason.
    };
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      socket = undefined;
      stopPing();
      if (!manuallyClosed && topicListeners.size > 0) scheduleReconnect();
    };
  }

  function send(message: Record<string, unknown>): boolean {
    if (!client.connected) return false;
    socket?.send(JSON.stringify(message));
    return true;
  }

  function sendSubscription(topic: string): void {
    send({ type: 'subscribe', id: `subscribe:${topic}`, topic });
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
