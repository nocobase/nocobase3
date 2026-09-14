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
): () => void {
  const unsubscribeOpen = realtime.onOpen(refresh);
  const unsubscribeTopic = realtime.subscribe<unknown>(
    MAIL_REALTIME_TOPIC,
    (event): void => {
      if (isMailChanged(event.payload)) refresh();
    },
  );
  target.addEventListener('focus', refresh);

  return (): void => {
    target.removeEventListener('focus', refresh);
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
