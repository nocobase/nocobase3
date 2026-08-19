import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NavLink } from 'react-router';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  createPortalLiveProvider,
  type PortalLiveFrame,
  type PortalLiveSocket,
} from '../../portal-live/client/index.js';
import { fetchUnreadCount } from './api.js';

export interface NotificationInboxRuntimeValue {
  readonly unreadCount: number;
  readonly revision: number;
  refresh(): void;
}

const NotificationInboxRuntimeContext = createContext<NotificationInboxRuntimeValue | undefined>(undefined);

export function NotificationInboxProvider({ children }: React.PropsWithChildren): React.ReactElement {
  const [unreadCount, setUnreadCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback((): void => setRevision((value) => value + 1), []);
  const seenEventIds = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    fetchUnreadCount(controller.signal).then(setUnreadCount).catch(() => undefined);
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    const provider = createPortalLiveProvider({
      connect: createBrowserPortalLiveSocket,
      onResyncRequired: refresh,
    });
    const subscription = provider.subscribe({
      channel: 'notifications/inbox',
      callback: (event) => {
        if (seenEventIds.current.has(event.eventId)) return;
        seenEventIds.current.add(event.eventId);
        if (seenEventIds.current.size > 256) {
          const oldest = seenEventIds.current.values().next().value;
          if (typeof oldest === 'string') seenEventIds.current.delete(oldest);
        }
        refresh();
      },
    });
    return () => {
      subscription.unsubscribe();
      provider.close();
    };
  }, [refresh]);

  const value = useMemo<NotificationInboxRuntimeValue>(
    () => ({ unreadCount, revision, refresh }),
    [refresh, revision, unreadCount],
  );
  return <NotificationInboxRuntimeContext.Provider value={value}>{children}</NotificationInboxRuntimeContext.Provider>;
}

export function useNotificationInboxRuntime(): NotificationInboxRuntimeValue {
  const value = useContext(NotificationInboxRuntimeContext);
  if (!value) throw new Error('NotificationInboxProvider is required.');
  return value;
}

export function NotificationInboxBell(): React.ReactElement {
  const { unreadCount } = useNotificationInboxRuntime();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            nativeButton={false}
            render={<NavLink to="/inbox" aria-label={label} />}
            variant="outline"
            size="icon"
            className="relative size-9 rounded-xl border-border/70 bg-background/60 sm:size-10"
          >
            <Bell />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-5 text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function createBrowserPortalLiveSocket(): PortalLiveSocket {
  const socket = new WebSocket(resolveLiveUrl());
  const queued: PortalLiveFrame[] = [];
  const messageListeners = new Set<(frame: PortalLiveFrame) => void>();
  const closeListeners = new Set<() => void>();
  socket.addEventListener('open', () => {
    for (const frame of queued.splice(0)) socket.send(JSON.stringify(frame));
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    const frame = parsePortalLiveFrame(event.data);
    if (frame) for (const listener of messageListeners) listener(frame);
  });
  socket.addEventListener('close', () => {
    for (const listener of closeListeners) listener();
  });
  return {
    send(frame): void {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
      else if (socket.readyState === WebSocket.CONNECTING) queued.push(frame);
    },
    close(): void {
      socket.close();
    },
    onMessage(listener): () => void {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener): () => void {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };
}

function resolveLiveUrl(): string {
  const portalBase = window.NOCOBASE_PORTAL_BASE ?? '/';
  const url = new URL(`${portalBase.replace(/\/$/, '')}/live`, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function parsePortalLiveFrame(value: string): PortalLiveFrame | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'type' in parsed
      ? (parsed as PortalLiveFrame)
      : undefined;
  } catch {
    return undefined;
  }
}
