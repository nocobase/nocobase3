import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthorizationCheck } from './authorization-client.js';
import { useAuthorizationClient } from './use-authorization-client.js';
import { useAuthorizationRevision } from './use-authorization-revision.js';

export interface UseCanOptions {
  readonly enabled?: boolean;
}

export interface UseCanResult {
  readonly can: boolean;
  readonly isPending: boolean;
  readonly error: unknown;
  readonly retry: () => void;
}

/** Checks feature visibility against the current session's permission snapshot. */
export function useCan(
  check: AuthorizationCheck | undefined,
  { enabled = true }: UseCanOptions = {},
): UseCanResult {
  const client = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const type = check?.resource.type;
  const id = check?.resource.id;
  const action = check?.action;
  const active = enabled && check !== undefined;
  const request = useMemo(
    () => ({ client, revision, type, id, action, active }),
    [client, revision, type, id, action, active],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    can: boolean;
    error?: unknown;
  }>();
  useEffect(() => {
    const { client, type, id, action, active } = request;
    if (
      !active ||
      type === undefined ||
      id === undefined ||
      action === undefined
    )
      return;
    let current = true;
    const finish = (can: boolean, error?: unknown) => {
      if (current) setResult({ request, can, error });
    };
    void client.can({ resource: { type, id }, action }).then(
      (can) => finish(can),
      (error: unknown) => finish(false, error),
    );
    return () => {
      current = false;
    };
  }, [request]);
  const fresh = result?.request === request;
  const retry = useCallback(() => client.invalidatePermissions(), [client]);
  return {
    can: active && fresh && result.can,
    isPending: active && !fresh,
    error: active && fresh ? result.error : undefined,
    retry,
  };
}
