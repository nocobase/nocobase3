import type { AccessControlProvider } from "@refinedev/core";

import {
  aclStore,
  getAclState,
  loadAcl,
} from "./store.ts";
import { evaluateAccess } from "./evaluator.ts";
import type { AclAccessRequest, RoleConstraint } from "./types.ts";

const toAclAccessRequest = ({
  resource,
  action,
  params,
}: Parameters<AccessControlProvider["can"]>[0]): AclAccessRequest => ({
  resource,
  action,
  id: params?.id,
  field: typeof params?.field === "string" ? params.field : undefined,
  dataSourceKey:
    typeof params?.dataSourceKey === "string"
      ? params.dataSourceKey
      : undefined,
  roles: params?.roles as RoleConstraint | undefined,
  meta: params?.meta as Record<string, unknown> | undefined,
  resourceItem: params?.resource,
});

export const accessControlProvider: AccessControlProvider = {
  can: async (request) => {
    const state = await loadAcl();
    const can =
      state.status === "ready" &&
      evaluateAccess(
        state.permissions,
        toAclAccessRequest(request),
        aclStore.recordPermissions.getPermission
      );

    return {
      can,
      reason: can
        ? undefined
        : "You don't have permission to perform this action.",
    };
  },
  options: {
    buttons: {
      enableAccessControl: true,
      hideIfUnauthorized: true,
    },
    queryOptions: {
      staleTime: Infinity,
    },
  },
};

export const canAccessCurrentAcl = (request: AclAccessRequest) => {
  const state = getAclState();
  return (
    state.status === "ready" &&
    evaluateAccess(
      state.permissions,
      request,
      aclStore.recordPermissions.getPermission
    )
  );
};
