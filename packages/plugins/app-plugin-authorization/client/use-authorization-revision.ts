import { useCallback, useSyncExternalStore } from 'react';

import { useAuthorizationClient } from './use-authorization-client.js';

export function useAuthorizationRevision(): number {
  const client = useAuthorizationClient();
  const subscribe = useCallback(
    (listener: () => void) => client.onInvalidated(listener),
    [client],
  );
  const getSnapshot = useCallback(() => client.revision(), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
