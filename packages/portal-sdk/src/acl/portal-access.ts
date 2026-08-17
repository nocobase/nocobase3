import { NocoBaseHttpError } from "../client/error.ts";
import type { PortalAccessDeniedData, RoleMode } from "./types.ts";

const roleModes = new Set<RoleMode>([
  "default",
  "allow-use-union",
  "only-use-union",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const getPortalAccessDeniedData = (
  error: unknown
): PortalAccessDeniedData | undefined => {
  if (!(error instanceof NocoBaseHttpError) || error.status !== 403) {
    return undefined;
  }
  if (!isObject(error.payload)) return undefined;

  const errors = error.payload.errors;
  if (
    !Array.isArray(errors) ||
    !errors.some(
      (item) => isObject(item) && item.code === "PORTAL_ACCESS_DENIED"
    )
  ) {
    return undefined;
  }

  const data = error.payload.data;
  if (!isObject(data)) return undefined;
  if (typeof data.portalName !== "string" || !data.portalName.trim()) {
    return undefined;
  }
  if (data.role !== undefined && typeof data.role !== "string") {
    return undefined;
  }
  if (
    !Array.isArray(data.roles) ||
    !data.roles.every((role) => typeof role === "string")
  ) {
    return undefined;
  }
  if (
    data.roleMode !== undefined &&
    (typeof data.roleMode !== "string" ||
      !roleModes.has(data.roleMode as RoleMode))
  ) {
    return undefined;
  }
  if (
    data.allowAnonymous !== undefined &&
    typeof data.allowAnonymous !== "boolean"
  ) {
    return undefined;
  }

  return {
    portalName: data.portalName,
    role:
      typeof data.role === "string" && data.role.trim()
        ? data.role.trim()
        : undefined,
    roles: [...data.roles],
    roleMode: data.roleMode as RoleMode | undefined,
    allowAnonymous: data.allowAnonymous,
  };
};
