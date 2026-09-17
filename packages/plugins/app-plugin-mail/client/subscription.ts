import type { RealtimeClient } from '@nocobase/app-client';

import { MAIL_REALTIME_TOPIC } from '../shared/realtime.js';

export interface MailFocusTarget {
  addEventListener(type: 'focus', listener: EventListener): void;
  removeEventListener(type: 'focus', listener: EventListener): void;
}

export function subscribeToMailInvalidations(
  realtime: RealtimeClient,
  target: MailFocusTarget,
  refresh: () => void,
  onFocus: () => void = refresh,
): () => void {
  const unsubscribeOpen = realtime.onOpen(refresh);
  const unsubscribeTopic = realtime.subscribe<unknown>(
    MAIL_REALTIME_TOPIC,
    (event): void => {
      if (isMailChanged(event.payload)) refresh();
    },
  );
  target.addEventListener('focus', onFocus);

  return (): void => {
    target.removeEventListener('focus', onFocus);
    unsubscribeTopic();
    unsubscribeOpen();
  };
}

function isMailChanged(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'mail.changed'
  );
}

export const MAIL_UNREAD_COUNT_CHANGED_EVENT =
  'nocobase:mail-unread-count-changed';
