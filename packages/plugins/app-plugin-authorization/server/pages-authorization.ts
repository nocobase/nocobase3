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

export class PageReference<N extends string> {
  constructor(readonly name: N) {}
  access(): PermissionGrant {
    return {
      resource: { type: 'page', id: this.name },
      actions: [{ action: 'access' }],
    };
  }
}

export class PageBuilder<N extends string> {
  constructor(
    private readonly definition: Omit<ResourceItemDefinition, 'id'> & {
      name: N;
    },
  ) {}
  build(): Omit<ResourceItemDefinition, 'id'> & { name: N } {
    return structuredClone(this.definition);
  }
  reference(): PageReference<N> {
    return new PageReference(this.definition.name);
  }
  register(api: PagesApi): PageReference<N> {
    api.add(this.build());
    return this.reference();
  }
}
export function authorizationPage<const N extends string>(
  name: N,
  metadata: { title: import('@nocobase/authorization/core').ResourceTitle },
): PageBuilder<N> {
  return new PageBuilder({ name, ...metadata, actions: ['access'] });
}

export interface PagesApi {
  define<const N extends string>(
    name: N,
    metadata: { title: import('@nocobase/authorization/core').ResourceTitle },
  ): PageReference<N>;
  add(definition: Omit<ResourceItemDefinition, 'id'> & { name: string }): void;
  grant(name: string, actions: readonly string[]): PermissionGrant;
}
export type PagesPlugin = AuthorizationPlugin<{ pages: PagesApi }>;

export function pages(): PagesPlugin {
  const items = new ResourceItems();
  return {
    authorizationApi: {
      pages: {
        define: (name, metadata) => {
          items.add({ id: name, ...metadata, actions: ['access'] });
          return new PageReference(name);
        },
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
