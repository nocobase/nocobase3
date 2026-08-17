import type { Role } from "@nocobase/portal-sdk/acl";

import { UNION_ROLE } from "@/extensions/nocobase-acl";

export function hasMultipleUserRoles(roles: Role[]) {
  return roles.filter((role) => role.name !== UNION_ROLE).length > 1;
}
