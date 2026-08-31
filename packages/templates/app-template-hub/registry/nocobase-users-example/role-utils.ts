import type { Role } from '@nocobase/app-portal-sdk/acl';
import { resolveTranslatableText } from '@nocobase/app-portal-sdk/i18n';

export function resolveRoleLabel(role: Role) {
  return resolveTranslatableText(role.title || role.name, { ns: 'starter' });
}
