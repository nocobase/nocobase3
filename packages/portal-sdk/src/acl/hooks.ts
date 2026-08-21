import { useSyncExternalStore } from 'react';

import { useAclState, useAclStore } from './context.ts';
import { evaluateAccess } from './evaluator.ts';
import type { AclAccessRequest } from './types.ts';

export type UseGetRolesResult = {
  data: string[] | undefined;
  error: Error | undefined;
  isError: boolean;
  isLoading: boolean;
  isPending: boolean;
};

export const useAclEvaluator = (): ((request: AclAccessRequest) => boolean) => {
  const store = useAclStore();
  const state = useAclState();
  useSyncExternalStore(
    store.recordPermissions.subscribe,
    store.recordPermissions.getState,
    store.recordPermissions.getState,
  );

  return (request: AclAccessRequest) =>
    state.status === 'ready' &&
    evaluateAccess(
      state.permissions,
      request,
      store.recordPermissions.getPermission,
    );
};

export const useCanAccess = (request: AclAccessRequest): boolean =>
  useAclEvaluator()(request);

export const useGetRoles = (): UseGetRolesResult => {
  const state = useAclState();
  const isLoading = state.status === 'idle' || state.status === 'loading';
  const isError = state.status === 'error';

  return {
    data: state.status === 'ready' ? state.permissions.roles : undefined,
    error: isError ? state.error : undefined,
    isError,
    isLoading,
    isPending: isLoading,
  };
};
