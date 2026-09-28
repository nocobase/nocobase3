import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthorizationRequirement } from './authorization-client.js';
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

/**
 * Checks feature visibility against the current session's permission snapshot.
 * `'unrestricted'` passes only for identities with unrestricted access, such as root.
 */
export function useCan(
  check: AuthorizationRequirement | undefined,
  { enabled = true }: UseCanOptions = {},
): UseCanResult {
  const client = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const unrestricted = check === 'unrestricted';
  const type = unrestricted ? undefined : check?.resource.type;
  const id = unrestricted ? undefined : check?.resource.id;
  const action = unrestricted ? undefined : check?.action;
  const active = enabled && check !== undefined;
  const request = useMemo(
    () => ({ client, revision, unrestricted, type, id, action, active }),
    [client, revision, unrestricted, type, id, action, active],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    can: boolean;
    error?: unknown;
  }>();
  useEffect(() => {
    const { client, unrestricted, type, id, action, active } = request;
    if (!active) return;
    let requirement: AuthorizationRequirement;
    if (unrestricted) requirement = 'unrestricted';
    else if (type !== undefined && id !== undefined && action !== undefined)
      requirement = { resource: { type, id }, action };
    else return;
    let current = true;
    const finish = (can: boolean, error?: unknown) => {
      if (current) setResult({ request, can, error });
    };
    void client.can(requirement).then(
      (can) => finish(can),
      (error: unknown) => finish(false, error),
    );
    return () => {
      current = false;
    };
  }, [request]);
  const fresh = result?.request === request;
  const retry = useCallback(() => client.invalidate(), [client]);
  return {
    can: active && fresh && result.can,
    isPending: active && !fresh,
    error: active && fresh ? result.error : undefined,
    retry,
  };
}
