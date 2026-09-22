import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
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

/** Discover page grants from the normalized route authorization contract. */
export function grantablePages(
  routes: readonly AppClientRegisteredRoute[],
  group?: string,
): readonly GrantablePage[] {
  const pages = routes.flatMap((route) => [
    ...(route.componentLoader &&
    route.authz !== 'skip' &&
    route.authz.resource.type === 'page' &&
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
 * Adds the pages the browser discovered to the page resource type the server reported, leaving every other resource
 * type — database collections, settings resources — exactly as it came back. A page the server already listed keeps
 * its own title and metadata; display groups always come from the route tree.
 */
export function withPageResources(
  options: AuthorizationOptions,
  pages: readonly ResourceOption[],
  groups: readonly ResourceGroupOption[] = [],
): AuthorizationOptions {
  const routePages = new Map(pages.map((page) => [page.value, page]));
  return {
    ...options,
    resourceTypes: options.resourceTypes.map((resourceType) => {
      if (resourceType.value !== PAGE_RESOURCE_TYPE) return resourceType;
      const declared = new Set(
        resourceType.resources.map((resource) => resource.value),
      );
      return {
        ...resourceType,
        groups,
        resources: [
          ...resourceType.resources.map((resource) => {
            const page = routePages.get(resource.value);
            return { ...resource, group: page?.group };
          }),
          ...pages.filter((page) => !declared.has(page.value)),
        ],
      };
    }),
  };
}

/** Navigation-only route nodes form the display tree; pages remain flat items. */
export function pageGroups(
  routes: readonly AppClientRegisteredRoute[],
  translate: (title: string, namespace: string) => string,
): readonly ResourceGroupOption[] {
  return routes.flatMap((route) => {
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
