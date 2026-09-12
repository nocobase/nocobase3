export const IN_APP_NOTIFICATION_REALTIME_TOPIC: string =
  'notifications:in-app';

export type InAppNotificationChange =
  'created' | 'read' | 'unread' | 'deleted' | 'read-all';

export interface InAppNotificationRealtimeEvent {
  readonly kind: 'inbox.changed';
  readonly change: InAppNotificationChange;
}
