import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAppClient } from '@nocobase/app-client';
import { fetchUnreadCount } from './api.js';

export const IN_APP_NOTIFICATION_REALTIME_TOPIC: string =
  'notifications:in-app';

export interface NotificationInAppRuntimeValue {
  readonly unreadCount: number;
  readonly revision: number;
  refresh(): void;
}

const NotificationInAppRuntimeContext = createContext<
  NotificationInAppRuntimeValue | undefined
>(undefined);

export function NotificationInAppProvider({
  children,
}: React.PropsWithChildren): React.ReactElement {
  const appClient = useAppClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(
    (): void => setRevision((value) => value + 1),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchUnreadCount(controller.signal)
      .then(setUnreadCount)
      .catch(() => undefined);
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const refreshInbox = (): void => refresh();
    const unsubscribeOpen = appClient.realtime?.onOpen(refreshInbox);
    const unsubscribeTopic = appClient.realtime?.subscribe<{
      readonly kind?: unknown;
    }>(IN_APP_NOTIFICATION_REALTIME_TOPIC, (event): void => {
      if (event.payload.kind === 'inbox.changed') refreshInbox();
    });
    window.addEventListener('focus', refreshInbox);

    return () => {
      window.removeEventListener('focus', refreshInbox);
      unsubscribeTopic?.();
      unsubscribeOpen?.();
    };
  }, [appClient, refresh]);

  const value = useMemo<NotificationInAppRuntimeValue>(
    () => ({ unreadCount, revision, refresh }),
    [refresh, revision, unreadCount],
  );
  return (
    <NotificationInAppRuntimeContext.Provider value={value}>
      {children}
    </NotificationInAppRuntimeContext.Provider>
  );
}

export function useNotificationInAppRuntime(): NotificationInAppRuntimeValue {
  const value = useContext(NotificationInAppRuntimeContext);
  if (!value) throw new Error('NotificationInAppProvider is required.');
  return value;
}
