import type { PropsWithChildren, ReactNode } from "react";
import { useCanAccess, type AclAccessRequest } from "@nocobase/portal-sdk/acl";


export type CanAccessProps = PropsWithChildren<
  AclAccessRequest & {
    fallback?: ReactNode;
  }
>;

export function CanAccess({
  children,
  fallback = null,
  ...request
}: CanAccessProps) {
  return useCanAccess(request) ? children : fallback;
}
