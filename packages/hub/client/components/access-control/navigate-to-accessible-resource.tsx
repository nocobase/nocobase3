import { useMenu } from "@refinedev/core";
import {
  filterMenuItemsByAcl,
  findFirstAccessibleRoute,
  useAclState,
} from "@nocobase/portal-sdk/acl";
import { Navigate } from "react-router";

import { AccessDenied } from "./access-denied";

export function NavigateToAccessibleResource() {
  const { menuItems } = useMenu();
  const state = useAclState();
  const route =
    state.status === "ready"
      ? findFirstAccessibleRoute(
          filterMenuItemsByAcl(menuItems, state.permissions)
        )
      : undefined;

  return route ? <Navigate to={route} replace /> : <AccessDenied />;
}
