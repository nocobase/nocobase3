import { useCallback, useSyncExternalStore } from 'react';

import { useAuthorizationClient } from './use-authorization-client.js';

export function useAuthorizationRevision(): number {
  const client = useAuthorizationClient();
  const subscribe = useCallback(
    (listener: () => void) => client.onPermissionsInvalidated(listener),
    [client],
  );
  const getSnapshot = useCallback(
    () => client.getPermissionsRevision(),
    [client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
