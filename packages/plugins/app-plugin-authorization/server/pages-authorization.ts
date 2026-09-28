import type {
  AuthorizationPlugin,
  PermissionGrant,
} from '@nocobase/authorization/core';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';
import type { UiAuthorizationApi } from './ui.js';

/**
 * Package-internal: the subsection the client fills with pages from its route
 * tree. Only pages are client-provided, so no other type gets one.
 */
export const PAGE_SECTION = 'pages.page';

/** `authz.pages`. Pages are not registered: the client route tree lists them. */
export interface PagesApi {
  /** A page `access` grant. */
  grant(id: string): PermissionGrant;
}

export interface PagesAuthorizationApi {
  pages: PagesApi;
}

export type PagesPlugin = AuthorizationPlugin<
  PagesAuthorizationApi,
  unknown,
  UiAuthorizationApi
>;

/** Registers the `page` record type, its `pages.page` subsection and `authz.pages`. */
export function pagesPlugin(): PagesPlugin {
  return {
    id: 'pages',
    dependencies: ['ui'],
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
      authz.ui.sections.add({
        name: PAGE_SECTION,
        parent: 'pages',
        title: { key: 'sections.page', ns: AUTHORIZATION_NAMESPACE },
        order: 0,
      });
    },
  };
}
