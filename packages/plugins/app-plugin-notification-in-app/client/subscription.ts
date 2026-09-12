import type { RealtimeClient } from '@nocobase/app-client';

import { IN_APP_NOTIFICATION_REALTIME_TOPIC } from '../shared/realtime.js';

export interface InboxFocusTarget {
  addEventListener(type: 'focus', listener: EventListener): void;
  removeEventListener(type: 'focus', listener: EventListener): void;
}

export function subscribeToInboxInvalidations(
  realtime: RealtimeClient,
  target: InboxFocusTarget,
  refresh: () => void,
): () => void {
  const unsubscribeOpen = realtime.onOpen(refresh);
  const unsubscribeTopic = realtime.subscribe<unknown>(
    IN_APP_NOTIFICATION_REALTIME_TOPIC,
    (event): void => {
      if (isInboxChanged(event.payload)) refresh();
    },
  );
  target.addEventListener('focus', refresh);

  return (): void => {
    target.removeEventListener('focus', refresh);
    unsubscribeTopic?.();
    unsubscribeOpen?.();
  };
}

function isInboxChanged(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'inbox.changed'
  );
}
