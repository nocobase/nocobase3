import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchUnreadCount } from "./api.js";

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
  if (!value) throw new Error("NotificationInAppProvider is required.");
  return value;
}
