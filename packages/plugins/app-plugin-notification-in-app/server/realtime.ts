import type { RealtimeUserTopic } from '@nocobase/app-server/realtime';

import type { InAppStore } from './store.js';

export const IN_APP_NOTIFICATION_REALTIME_TOPIC: string =
  'notifications:in-app';

export type InAppNotificationChange =
  'created' | 'read' | 'unread' | 'deleted' | 'read-all';

export interface InAppNotificationRealtimeEvent {
  readonly kind: 'inbox.changed';
  readonly change: InAppNotificationChange;
}

export type InAppNotificationRealtimeTopic = Pick<
  RealtimeUserTopic<InAppNotificationRealtimeEvent>,
  'publishFor'
>;

export function createRealtimeInAppStore(
  store: InAppStore,
  topic: InAppNotificationRealtimeTopic,
): InAppStore {
  return {
    async deliver(input) {
      const item = await store.deliver(input);
      publishChange(topic, input.userId, 'created');
      return item;
    },
    list(input) {
      return store.list(input);
    },
    countUnread(userId) {
      return store.countUnread(userId);
    },
    async update(input) {
      const item = await store.update(input);
      if (item) {
        publishChange(
          topic,
          input.userId,
          input.action === 'delete' ? 'deleted' : input.action,
        );
      }
      return item;
    },
    async markAllRead(userId) {
      const updated = await store.markAllRead(userId);
      if (updated > 0) {
        publishChange(topic, userId, 'read-all');
      }
      return updated;
    },
  };
}

function publishChange(
  topic: InAppNotificationRealtimeTopic,
  userId: string,
  change: InAppNotificationChange,
): void {
  try {
    topic.publishFor(userId, {
      kind: 'inbox.changed',
      change,
    });
  } catch (error) {
    console.error(
      'Failed to publish in-app notification realtime event.',
      error,
    );
  }
}
