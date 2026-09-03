import { appApiClientToken, useService } from '@nocobase/app-client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { fetchUnreadCount } from '../api.js';
import {
  NotificationInAppRuntimeContext,
  type NotificationInAppRuntimeValue,
} from '../notification-in-app-runtime.js';
import { subscribeToInboxInvalidations } from '../subscription.js';

export function NotificationInAppProvider({
  children,
}: PropsWithChildren): ReactElement {
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
