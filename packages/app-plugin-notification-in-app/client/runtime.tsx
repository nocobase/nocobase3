import { useAppClient } from '@nocobase/app-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import {
  createInAppNotificationClient,
  type InAppNotificationClient,
} from './api.js';

const IN_APP_NOTIFICATION_REALTIME_TOPIC = 'notifications:in-app';

export interface InAppNotificationRuntime extends InAppNotificationClient {
  readonly unreadCount: number;
  readonly revision: number;
  refresh(): void;
}

const InAppNotificationContext = createContext<
  InAppNotificationRuntime | undefined
>(undefined);

export function InAppNotificationProvider({
  children,
}: PropsWithChildren): ReactElement {
  const appClient = useAppClient();
  const notificationClient = useMemo(
    () => createInAppNotificationClient(appClient),
    [appClient],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(
    (): void => setRevision((value) => value + 1),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    notificationClient
      .countUnread(controller.signal)
      .then(setUnreadCount)
      .catch(() => undefined);
    return () => controller.abort();
  }, [notificationClient, revision]);

  useEffect(() => {
    const realtime = appClient.realtime;
    const refreshInbox = (): void => refresh();
    const unsubscribeOpen = realtime?.onOpen(refreshInbox);
    const unsubscribeTopic = realtime?.subscribe<{
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

  const value = useMemo<InAppNotificationRuntime>(
    () => ({
      ...notificationClient,
      unreadCount,
      revision,
      refresh,
    }),
    [notificationClient, refresh, revision, unreadCount],
  );

  return (
    <InAppNotificationContext.Provider value={value}>
      {children}
    </InAppNotificationContext.Provider>
  );
}

export function useInAppNotifications(): InAppNotificationRuntime {
  const value = useContext(InAppNotificationContext);
  if (!value) throw new Error('InAppNotificationProvider is required.');
  return value;
}
