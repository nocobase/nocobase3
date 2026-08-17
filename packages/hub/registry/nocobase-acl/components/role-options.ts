import type { Role, RoleMode } from "@nocobase/portal-sdk/acl";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

export const UNION_ROLE = "__union__";
export const ANONYMOUS_ROLE = "anonymous";

export function resolveRoleTitle(role?: Role) {
  return resolveTranslatableText(role?.title || role?.name || "Role", {
    ns: "starter",
  });
}

export function getRoleOptions({
  roles,
  roleMode,
  allowAnonymous = false,
}: {
  roles: Role[];
  roleMode?: RoleMode;
  allowAnonymous?: boolean;
}) {
  if (roleMode === "only-use-union") {
    return [{ name: UNION_ROLE, title: "Full permissions" }];
  }

  const options = roles.filter(
    (role) => role.name !== UNION_ROLE && role.name !== ANONYMOUS_ROLE
  );
  if (allowAnonymous) {
    options.push({ name: ANONYMOUS_ROLE, title: "Anonymous" });
  }
  if (roleMode === "allow-use-union") {
    options.unshift({ name: UNION_ROLE, title: "Full permissions" });
  }
  return options;
}

export function canSwitchRoles(roles: Role[], roleMode?: RoleMode) {
  return roles.length > 1 && roleMode !== "only-use-union";
}
