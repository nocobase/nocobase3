import {
  compareNavigationOrder,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import type {
  AuthorizationOptions,
  ResourceOption,
  ResourceGroupOption,
} from '../authorization-client.js';

/** The resource type page grants are stored under. */
export const PAGE_RESOURCE_TYPE = 'page';

/**
 * A page an administrator may grant access to. `name` is what a stored grant records, so it is the identifier and not
 * a display concern; `title` is the untranslated navigation key, which the caller translates in `packageName`.
 */
export interface GrantablePage {
  readonly name: string;
  readonly packageName: string;
  readonly title?: string;
  readonly group?: string;
}

/** Siblings in menu order: `navigation.order`, then registration order. */
function inMenuOrder(
  routes: readonly AppClientRegisteredRoute[],
): readonly AppClientRegisteredRoute[] {
  return [...routes].sort(compareNavigationOrder);
}

/** Discover page grants from the route tree, in menu order. */
export function grantablePages(
  routes: readonly AppClientRegisteredRoute[],
  group?: string,
): readonly GrantablePage[] {
  const pages = inMenuOrder(routes).flatMap((route) => [
    ...(route.componentLoader &&
    route.authz !== 'skip' &&
    route.authz.resource.type === PAGE_RESOURCE_TYPE &&
    route.authz.action === 'access'
      ? [
          {
            name: route.authz.resource.id,
            ...(group ? { group } : {}),
            packageName: route.packageName,
            ...(route.navigation?.title === undefined
              ? {}
              : { title: route.navigation.title }),
          },
        ]
      : []),
    ...grantablePages(
      route.children ?? [],
      !route.componentLoader && route.navigation ? route.name : group,
    ),
  ]);
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.name)) return false;
    seen.add(page.name);
    return true;
  });
}

/**
 * Fills the page subsection with the pages and groups of the route tree. The
 * server lists no page: it validates none.
 */
export function withPageResources(
  options: AuthorizationOptions,
  pages: readonly Omit<ResourceOption, 'type'>[],
  groups: readonly ResourceGroupOption[] = [],
): AuthorizationOptions {
  return {
    ...options,
    sections: options.sections.map((section) => ({
      ...section,
      subsections: section.subsections.map((subsection) =>
        subsection.recordType === PAGE_RESOURCE_TYPE
          ? {
              ...subsection,
              groups,
              resources: pages.map((page) => ({
                ...page,
                type: PAGE_RESOURCE_TYPE,
              })),
            }
          : subsection,
      ),
    })),
  };
}

/** Navigation-only route nodes form the display tree, in menu order. */
export function pageGroups(
  routes: readonly AppClientRegisteredRoute[],
  translate: (title: string, namespace: string) => string,
): readonly ResourceGroupOption[] {
  return inMenuOrder(routes).flatMap((route) => {
    if (route.componentLoader) return [];
    const children = pageGroups(route.children ?? [], translate);
    if (!route.navigation) return children;
    if (grantablePages(route.children ?? []).length === 0) return [];
    return [
      {
        value: route.name,
        label: translate(route.navigation.title, route.packageName),
        ...(children.length ? { children } : {}),
      },
    ];
  });
}
