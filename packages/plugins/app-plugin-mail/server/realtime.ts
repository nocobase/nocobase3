import type { RealtimeUserTopic } from '@nocobase/app-server/realtime';

import type { MailRealtimeEvent } from '../shared/realtime.js';

export {
  MAIL_REALTIME_TOPIC,
  type MailRealtimeEvent,
} from '../shared/realtime.js';

export interface MailMessageChangeNotifier {
  notify(userId: string): void;
}

export type MailRealtimeTopic = Pick<
  RealtimeUserTopic<MailRealtimeEvent>,
  'publishFor'
>;

export function createMailMessageChangeNotifier(
  topic: MailRealtimeTopic,
): MailMessageChangeNotifier {
  return {
    notify(userId: string): void {
      topic.publishFor(userId, { kind: 'mail.changed' });
    },
  };
}

export function notifyMailMessageChange(
  notifier: MailMessageChangeNotifier | undefined,
  userId: string,
): void {
  if (!notifier) return;
  try {
    notifier.notify(userId);
  } catch (error) {
    console.error('Failed to publish Mail realtime event.', error);
  }
}
