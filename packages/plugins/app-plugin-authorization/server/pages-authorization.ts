import type {
  AuthorizationPlugin,
  PermissionGrant,
} from '@nocobase/authorization/core';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

/** `authz.pages`. Pages are not registered: the client route tree lists them. */
export interface PagesApi {
  /** A page `access` grant. */
  grant(id: string): PermissionGrant;
}

export interface PagesAuthorizationApi {
  pages: PagesApi;
}

export type PagesPlugin = AuthorizationPlugin<PagesAuthorizationApi>;

/** Registers the `page` record type and `authz.pages`. */
export function pagesPlugin(): PagesPlugin {
  return {
    id: 'pages',
    authorizationApi: {
      pages: {
        grant: (id) => {
          if (!id) throw new TypeError('A page grant needs a page id');
          return {
            resource: { type: 'page', id },
            actions: [{ action: 'access' }],
          };
        },
      },
    },
    setup(authz): void {
      authz.resourceTypes.add({
        type: 'page',
        actions: [
          {
            name: 'access',
            title: {
              key: 'options.actions.access',
              ns: AUTHORIZATION_NAMESPACE,
            },
          },
        ],
      });
    },
  };
}
