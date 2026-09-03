import type { AppClient } from '@nocobase/app-client';

import { IN_APP_NOTIFICATION_REALTIME_TOPIC } from '../shared/realtime.js';

export interface InboxFocusTarget {
  addEventListener(type: 'focus', listener: EventListener): void;
  removeEventListener(type: 'focus', listener: EventListener): void;
}

export function subscribeToInboxInvalidations(
  appClient: AppClient,
  target: InboxFocusTarget,
  refresh: () => void,
): () => void {
  const unsubscribeSubscribed = appClient.realtime?.onSubscribed?.(
    IN_APP_NOTIFICATION_REALTIME_TOPIC,
    refresh,
  );
  const unsubscribeTopic = appClient.realtime?.subscribe<unknown>(
    IN_APP_NOTIFICATION_REALTIME_TOPIC,
    (event): void => {
      if (isInboxChanged(event.payload)) refresh();
    },
  );
  target.addEventListener('focus', refresh);

  return (): void => {
    target.removeEventListener('focus', refresh);
    unsubscribeTopic?.();
    unsubscribeSubscribed?.();
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
