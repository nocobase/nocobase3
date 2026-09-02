import type { NotificationI18nText } from '@nocobase/app-plugin-notification';

export const NOTIFICATION_PROVIDERS_NAMESPACE: string =
  '@nocobase/app-plugin-notification-providers';

export function notificationProviderText(
  key: string,
  defaultValue: string,
): NotificationI18nText {
  return { ns: NOTIFICATION_PROVIDERS_NAMESPACE, key, defaultValue };
}
