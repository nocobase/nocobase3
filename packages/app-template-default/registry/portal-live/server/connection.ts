import type { PortalLiveEvent, PortalLivePublisher, PortalLiveReplay } from './index.js';
import {
  createPortalLiveSession,
  type PortalLiveAuthenticator,
  type PortalLiveCursor,
  type PortalLivePrincipal,
  type PortalLiveSessionFrame,
} from './session.js';

export interface PortalLiveSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onMessage(listener: (data: string) => void): () => void;
  onClose(listener: (code: number, reason: string) => void): () => void;
  onError(listener: (error: unknown) => void): () => void;
  ping(): void;
  onPong(listener: () => void): () => void;
}

export interface PortalLiveConnectionOptions {
  readonly socket: PortalLiveSocket;
  readonly publisher: PortalLivePublisher;
  readonly authenticator: PortalLiveAuthenticator;
  readonly heartbeatIntervalMs?: number;
  readonly missedPongLimit?: number;
  readonly authTimeoutMs?: number;
  readonly maxFrameBytes?: number;
  readonly maxSubscriptions?: number;
  readonly onError?: (error: unknown) => void;
}

export interface PortalLiveConnection {
  readonly principal: PortalLivePrincipal | undefined;
  readonly closed: boolean;
  close(code?: number, reason?: string): void;
  drain(): void;
}

export type PortalLiveFrame =
  | { readonly version: 1; readonly type: 'auth_ok'; readonly streamId: string }
  | { readonly version: 1; readonly type: 'subscribed' | 'unsubscribed'; readonly subscriptionId: string }
  | { readonly version: 1; readonly type: 'event'; readonly subscriptionId: string; readonly event: PortalLiveEvent }
  | { readonly version: 1; readonly type: 'resync_required'; readonly streamId: string; readonly sequence: number }
  | { readonly version: 1; readonly type: 'server_draining' }
  | { readonly version: 1; readonly type: 'error'; readonly code: PortalLiveErrorCode; readonly message: string };

export type PortalLiveErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'AUTH_ALREADY_COMPLETED'
  | 'SUBSCRIPTION_LIMIT'
  | 'INVALID_CHANNEL'
  | 'INVALID_FRAME';

interface ActiveSubscription {
  readonly channel: string;
  readonly types: readonly string[] | undefined;
  unsubscribe(): void;
}

export function createPortalLiveConnection(options: PortalLiveConnectionOptions): PortalLiveConnection {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  const missedPongLimit = options.missedPongLimit ?? 2;
  const authTimeoutMs = options.authTimeoutMs ?? 5_000;
  const maxFrameBytes = options.maxFrameBytes ?? 65_536;
  let principal: PortalLivePrincipal | undefined;
  let session: ReturnType<typeof createPortalLiveSession> | undefined;
  let authAttempted = false;
  let closed = false;
  let missedPongs = 0;
  const subscriptions = new Map<string, ActiveSubscription>();
  const heartbeat = setInterval(() => {
    if (missedPongs >= missedPongLimit) {
      close(4003, 'heartbeat timeout');
      return;
    }
    missedPongs += 1;
    options.socket.ping();
  }, heartbeatIntervalMs);
  const authTimer = setTimeout(() => {
    if (!principal) close(4002, 'authentication timeout');
  }, authTimeoutMs);
  const socketUnsubscribers: Array<() => void> = [];

  const send = (frame: PortalLiveFrame): void => {
    if (!closed) options.socket.send(JSON.stringify(frame));
  };

  const sendError = (code: PortalLiveErrorCode, message: string): void => {
    send({ version: 1, type: 'error', code, message });
  };

  const bind = async (attempt: PortalLivePrincipal | undefined): Promise<void> => {
    if (!attempt || closed) return;
    principal = attempt;
    clearTimeout(authTimer);
    session = createPortalLiveSession({
      authenticator: options.authenticator,
      maxSubscriptions: options.maxSubscriptions,
      onSubscribe: (boundPrincipal, subscriptionId, channel, types, cursor) => {
        const unsubscribe = options.publisher.subscribe(boundPrincipal.appId, boundPrincipal.userId, (event) => {
          if (event.channel !== channel || !typesMatch(types, event)) return;
          send({ version: 1, type: 'event', subscriptionId, event });
        });
        subscriptions.set(subscriptionId, { channel, types, unsubscribe });
        sendReplay(send, subscriptionId, options.publisher.replay(boundPrincipal.appId, boundPrincipal.userId, cursor));
      },
      onUnsubscribe: (_boundPrincipal, subscriptionId) => {
        subscriptions.get(subscriptionId)?.unsubscribe();
        subscriptions.delete(subscriptionId);
      },
    });
    session.bind(attempt);
    send({ version: 1, type: 'auth_ok', streamId: `${attempt.appId}:${attempt.userId}` });
  };

  const handleFrame = async (frame: PortalLiveSessionFrame): Promise<void> => {
    if (frame.type === 'auth') {
      if (principal || authAttempted) {
        sendError('AUTH_ALREADY_COMPLETED', 'Authentication was already completed on this connection.');
        close(4001, 'duplicate authentication');
        return;
      }
      authAttempted = true;
      await bind(await options.authenticator.authenticate(frame.token));
      if (!principal) {
        sendError('AUTH_FAILED', 'Authentication failed.');
        close(4001, 'authentication failed');
      }
      return;
    }
    if (!principal || !session) {
      sendError('AUTH_REQUIRED', 'Authentication is required before subscribing.');
      return;
    }
    const result = await session.handle(frame);
    if (result.type === 'error') {
      sendError(result.code, resolveSessionErrorMessage(result.code));
    }
  };

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(authTimer);
    for (const unsubscribe of socketUnsubscribers) unsubscribe();
    socketUnsubscribers.length = 0;
    for (const subscription of subscriptions.values()) subscription.unsubscribe();
    subscriptions.clear();
    session?.close();
    session = undefined;
  };

  const close = (code = 1000, reason = 'closed'): void => {
    if (closed) return;
    teardown();
    options.socket.close(code, reason);
  };

  const drain = (): void => {
    if (closed) return;
    send({ version: 1, type: 'server_draining' });
    close(1001, 'server draining');
  };

  socketUnsubscribers.push(
    options.socket.onMessage((data) => {
      if (closed) return;
      if (data.length > maxFrameBytes) {
        sendError('INVALID_FRAME', 'Frame exceeds the maximum allowed size.');
        close(4000, 'invalid frame');
        return;
      }
      const frame = parseSessionFrame(data);
      if (!frame) {
        sendError('INVALID_FRAME', 'Frame does not match the Portal Live protocol.');
        close(4000, 'invalid frame');
        return;
      }
      void handleFrame(frame);
    }),
    options.socket.onClose((code, reason) => {
      if (closed) return;
      teardown();
      options.socket.close(code, reason);
    }),
    options.socket.onError((error) => options.onError?.(error)),
    options.socket.onPong(() => {
      missedPongs = 0;
    }),
  );

  void awaitCookiePrincipal(options.authenticator).then((attempt) => {
    void bind(attempt);
  });

  return {
    get principal(): PortalLivePrincipal | undefined {
      return principal;
    },
    get closed(): boolean {
      return closed;
    },
    close,
    drain,
  };
}

function typesMatch(types: readonly string[] | undefined, event: PortalLiveEvent): boolean {
  return !types || types.length === 0 || types.includes(event.type);
}

function sendReplay(send: (frame: PortalLiveFrame) => void, subscriptionId: string, replay: PortalLiveReplay): void {
  if (replay.kind === 'events') {
    for (const event of replay.events) {
      send({ version: 1, type: 'event', subscriptionId, event });
    }
    return;
  }
  send({ version: 1, type: 'resync_required', streamId: replay.cursor.streamId, sequence: replay.cursor.sequence });
}

async function awaitCookiePrincipal(authenticator: PortalLiveAuthenticator): Promise<PortalLivePrincipal | undefined> {
  try {
    return await authenticator.authenticate(undefined);
  } catch {
    return undefined;
  }
}

function parseSessionFrame(data: string): PortalLiveSessionFrame | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const frame = parsed as Record<string, unknown>;
  if (frame.version !== 1) return undefined;
  if (frame.type === 'auth') {
    return typeof frame.token === 'string' || frame.token === undefined
      ? { version: 1, type: 'auth', token: frame.token as string | undefined }
      : undefined;
  }
  if (frame.type === 'subscribe') {
    if (typeof frame.subscriptionId !== 'string' || typeof frame.channel !== 'string') return undefined;
    const types = parseTypes(frame.types);
    if (frame.types !== undefined && types === undefined) return undefined;
    const cursor = parseCursor(frame.cursor);
    if (frame.cursor !== undefined && cursor === undefined) return undefined;
    return { version: 1, type: 'subscribe', subscriptionId: frame.subscriptionId, channel: frame.channel, types, cursor };
  }
  if (frame.type === 'unsubscribe') {
    return typeof frame.subscriptionId === 'string'
      ? { version: 1, type: 'unsubscribe', subscriptionId: frame.subscriptionId }
      : undefined;
  }
  return undefined;
}

function parseTypes(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return undefined;
  return value as readonly string[];
}

function parseCursor(value: unknown): PortalLiveCursor | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return undefined;
  const cursor = value as Record<string, unknown>;
  return typeof cursor.streamId === 'string' && typeof cursor.sequence === 'number'
    ? { streamId: cursor.streamId, sequence: cursor.sequence }
    : undefined;
}

function resolveSessionErrorMessage(code: 'AUTH_REQUIRED' | 'AUTH_FAILED' | 'AUTH_ALREADY_COMPLETED' | 'SUBSCRIPTION_LIMIT' | 'INVALID_CHANNEL'): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Authentication is required.';
    case 'AUTH_FAILED':
      return 'Authentication failed.';
    case 'AUTH_ALREADY_COMPLETED':
      return 'Authentication was already completed on this connection.';
    case 'SUBSCRIPTION_LIMIT':
      return 'Subscription limit reached.';
    case 'INVALID_CHANNEL':
      return 'Channel is not allowed.';
  }
}