import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { appApiClientToken, useService } from '@nocobase/app-client';
import { IN_APP_NOTIFICATION_REALTIME_TOPIC } from '@nocobase/app-plugin-notification-in-app/realtime';
import { fetchUnreadCount } from './api.js';
import { subscribeToInboxInvalidations } from './subscription.js';

export { IN_APP_NOTIFICATION_REALTIME_TOPIC };

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
  const appClient = useService(appApiClientToken);
  const [unreadCount, setUnreadCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(
    (): void => setRevision((value) => value + 1),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchUnreadCount(appClient, controller.signal)
      .then(setUnreadCount)
      .catch(() => undefined);
    return () => controller.abort();
  }, [appClient, revision]);

  useEffect(() => {
    return subscribeToInboxInvalidations(appClient, window, refresh);
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
