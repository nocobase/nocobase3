import { useService } from '@nocobase/app-client';
import { useCallback, useSyncExternalStore } from 'react';

import { authorizationClientToken } from './tokens.js';

export function useAuthorizationRevision(): number {
  const client = useService(authorizationClientToken);
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
