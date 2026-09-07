import { createContext, useContext, type Context } from 'react';

export interface NotificationInAppRuntimeValue {
  readonly unreadCount: number;
  readonly revision: number;
  refresh(): void;
}

export const NotificationInAppRuntimeContext: Context<
  NotificationInAppRuntimeValue | undefined
> = createContext<NotificationInAppRuntimeValue | undefined>(undefined);

export function useNotificationInAppRuntime(): NotificationInAppRuntimeValue {
  const value = useContext(NotificationInAppRuntimeContext);
  if (!value) throw new Error('NotificationInAppProvider is required.');
  return value;
}
