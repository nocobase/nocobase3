import {
  ResourceItems,
  type ResourceItemDefinition,
} from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/permissions';
import type {
  AuthorizationGrant,
  AuthorizationPlugin,
  AuthorizationReason,
} from '@nocobase/authorization/core';

export interface PagesApi {
  add(definition: Omit<ResourceItemDefinition, 'id'> & { name: string }): void;
  grant(name: string, actions: readonly string[]): PermissionGrant;
}
export type PagesPlugin = AuthorizationPlugin<{ pages: PagesApi }>;

export function pages(): PagesPlugin {
  const items = new ResourceItems();
  return {
    authorizationApi: {
      pages: {
        add: ({ name, ...definition }) =>
          items.add({ ...definition, id: name }),
        grant: (name, actions) => ({
          resource: { type: 'page', id: name },
          actions: actions.map((action) => ({ action })),
        }),
      },
    },
    id: 'pages',
    requiresGrants: true,
    setup(authz): void {
      authz.resourceTypes.add({
        resourceType: 'page',
        items,
        actions: [
          {
            name: 'access',
            async authorize(request, context) {
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
                    reasons: staticGrants.map(grantReason),
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
          },
        ],
      });
    },
  };
}

function grantReason(grant: AuthorizationGrant): AuthorizationReason {
  return {
    code: 'PAGE_ACCESS_GRANTED',
    message: `${grant.source.plugin}:${grant.source.id} allows access to page "${grant.resource.id}"`,
    plugin: 'pages',
    details: { source: grant.source },
  };
}
