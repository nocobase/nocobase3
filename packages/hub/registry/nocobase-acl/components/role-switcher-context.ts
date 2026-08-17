import type { AclState, RoleMode } from "@nocobase/portal-sdk/acl";

export type RoleSwitcherContext = {
  currentRole?: string;
  roleMode?: RoleMode;
  allowAnonymous?: boolean;
};

export function resolveRoleSwitcherContext(
  state: AclState,
  storedRole?: string
): RoleSwitcherContext {
  if (state.status === "ready") {
    return {
      currentRole: state.permissions.currentRole ?? storedRole,
      roleMode: state.permissions.roleMode,
      allowAnonymous: state.permissions.allowAnonymous,
    };
  }

  if (state.status === "error" && state.portalAccessDenied) {
    return {
      currentRole: state.portalAccessDenied.role?.trim() || storedRole,
      roleMode: state.portalAccessDenied.roleMode,
      allowAnonymous: state.portalAccessDenied.allowAnonymous,
    };
  }

  return { currentRole: storedRole };
}
