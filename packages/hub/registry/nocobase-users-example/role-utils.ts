import type { Role } from "@nocobase/portal-sdk/acl";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

export function resolveRoleLabel(role: Role) {
  return resolveTranslatableText(role.title || role.name, { ns: "starter" });
}
