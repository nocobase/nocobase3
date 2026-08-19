export interface PortalLivePrincipal {
  readonly appId: string;
  readonly userId: string;
  readonly role?: string;
}

export interface PortalLiveCursor {
  readonly streamId: string;
  readonly sequence: number;
}

export interface PortalLiveAuthenticator {
  authenticate(token?: string): Promise<PortalLivePrincipal | undefined>;
}

export interface PortalLiveSessionOptions {
  readonly authenticator: PortalLiveAuthenticator;
  readonly maxSubscriptions?: number;
  readonly onSubscribe: (principal: PortalLivePrincipal, subscriptionId: string, channel: string, types: readonly string[] | undefined, cursor: PortalLiveCursor | undefined) => void;
  readonly onUnsubscribe: (principal: PortalLivePrincipal, subscriptionId: string) => void;
}

export type PortalLiveSessionFrame =
  | { readonly version: 1; readonly type: 'auth'; readonly token?: string }
  | {
      readonly version: 1;
      readonly type: 'subscribe';
      readonly subscriptionId: string;
      readonly channel: string;
      readonly types?: readonly string[];
      readonly cursor?: PortalLiveCursor;
    }
  | { readonly version: 1; readonly type: 'unsubscribe'; readonly subscriptionId: string };

export type PortalLiveSessionResult =
  | { readonly type: 'auth_ok'; readonly streamId: string }
  | { readonly type: 'subscribed'; readonly subscriptionId: string }
  | { readonly type: 'unsubscribed'; readonly subscriptionId: string }
  | { readonly type: 'error'; readonly code: 'AUTH_REQUIRED' | 'AUTH_FAILED' | 'AUTH_ALREADY_COMPLETED' | 'SUBSCRIPTION_LIMIT' | 'INVALID_CHANNEL' };

export function createPortalLiveSession(options: PortalLiveSessionOptions): {
  handle(frame: PortalLiveSessionFrame): Promise<PortalLiveSessionResult>;
  bind(principal: PortalLivePrincipal): void;
  principal(): PortalLivePrincipal | undefined;
  close(): void;
} {
  let boundPrincipal: PortalLivePrincipal | undefined;
  let closed = false;
  const subscriptions = new Set<string>();
  const maxSubscriptions = options.maxSubscriptions ?? 32;
  return {
    bind(principal: PortalLivePrincipal): void {
      boundPrincipal = principal;
    },
    async handle(frame): Promise<PortalLiveSessionResult> {
      if (closed) return { type: 'error', code: 'AUTH_REQUIRED' };
      if (frame.type === 'auth') {
        if (boundPrincipal) return { type: 'error', code: 'AUTH_ALREADY_COMPLETED' };
        boundPrincipal = await options.authenticator.authenticate(frame.token);
        return boundPrincipal ? { type: 'auth_ok', streamId: `${boundPrincipal.appId}:${boundPrincipal.userId}` } : { type: 'error', code: 'AUTH_FAILED' };
      }
      if (!boundPrincipal) return { type: 'error', code: 'AUTH_REQUIRED' };
      if (frame.type === 'subscribe') {
        if (frame.channel !== 'notifications/inbox') return { type: 'error', code: 'INVALID_CHANNEL' };
        if (!subscriptions.has(frame.subscriptionId) && subscriptions.size >= maxSubscriptions) return { type: 'error', code: 'SUBSCRIPTION_LIMIT' };
        subscriptions.add(frame.subscriptionId);
        options.onSubscribe(boundPrincipal, frame.subscriptionId, frame.channel, frame.types, frame.cursor);
        return { type: 'subscribed', subscriptionId: frame.subscriptionId };
      }
      subscriptions.delete(frame.subscriptionId);
      options.onUnsubscribe(boundPrincipal, frame.subscriptionId);
      return { type: 'unsubscribed', subscriptionId: frame.subscriptionId };
    },
    principal: () => boundPrincipal,
    close: () => { closed = true; subscriptions.clear(); },
  };
}
