import type { NotificationI18nText } from '@nocobase/app-plugin-notification';

export const IN_APP_NOTIFICATION_NAMESPACE: string =
  '@nocobase/app-plugin-notification-in-app';

export function inAppNotificationText(
  key: string,
  defaultValue: string,
): NotificationI18nText {
  return { ns: IN_APP_NOTIFICATION_NAMESPACE, key, defaultValue };
}
