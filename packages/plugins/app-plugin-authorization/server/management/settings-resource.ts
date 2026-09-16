import type { ResourceAuthorizationHandler } from '@nocobase/authorization/core';

export const settingsResource: ResourceAuthorizationHandler = {
  resourceType: 'settings',
  async authorize(request, context) {
    const grants = await context.grants.resolve({
      principal: request.principal,
      subjects: request.subjects,
      resource: request.resource,
      action: request.action,
    });
    return grants.length > 0
      ? {
          effect: 'permit',
          reasons: grants.map((grant) => ({
            code: 'PERMISSION_SET_ADMINISTRATION_GRANTED',
            message: `${grant.source.plugin}:${grant.source.id} allows settings administration`,
            plugin: 'permission-sets',
          })),
        }
      : {
          effect: 'deny',
          reasons: [
            {
              code: 'PERMISSION_SET_ADMINISTRATION_DENIED',
              message: 'Settings administration is not allowed',
              plugin: 'permission-sets',
            },
          ],
        };
  },
};

declare module '@nocobase/authorization/core' {
  interface AuthorizationResourceItems {
    settings: import('@nocobase/authorization/core').ResourceItems;
  }
}
