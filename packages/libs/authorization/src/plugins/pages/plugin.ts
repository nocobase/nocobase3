import type {
  AuthorizationGrant,
  AuthorizationPlugin,
  AuthorizationReason,
} from '../../core/index.js';

export type PagesPlugin = AuthorizationPlugin;

export function pages(): PagesPlugin {
  return {
    id: 'pages',
    requiresGrants: true,
    setup(authz): void {
      authz.resources.add({
        resourceType: 'page',
        async authorize(request, context) {
          if (request.action !== 'access') {
            return {
              effect: 'deny',
              reasons: [
                {
                  code: 'PAGE_ACTION_NOT_SUPPORTED',
                  message: `Page authorization does not support action "${request.action}"`,
                  plugin: 'pages',
                },
              ],
            };
          }
          const grants = await context.grants.resolve({
            principal: request.principal,
            subjects: request.subjects,
            resource: request.resource,
            action: request.action,
          });
          const staticGrants = grants.filter(
            (grant) => grant.policy === undefined,
          );
          return staticGrants.length > 0
            ? {
                effect: 'permit',
                reasons: staticGrants.map((grant) => grantReason(grant)),
              }
            : {
                effect: 'deny',
                reasons: [
                  {
                    code: 'PAGE_ACCESS_DENIED',
                    message: `Access to page "${request.resource.id}" is not allowed`,
                    plugin: 'pages',
                  },
                ],
              };
        },
      });
    },
  };
}

function grantReason(grant: AuthorizationGrant): AuthorizationReason {
  return {
    code: 'PAGE_ACCESS_GRANTED',
    message: `${grant.source.plugin}:${grant.source.id} allows access to page "${grant.resource.id}"`,
    plugin: 'pages',
  };
}
