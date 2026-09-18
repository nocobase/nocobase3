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

/**
 * The pages of the client route registry that page grants can name.
 *
 * A route is grantable when it loads a component, requires authentication, and declares no `access`: a route naming an
 * explicit resource is authorized as that resource rather than as a page, and one declaring `access: false` is
 * unconditional, so neither can be granted or withheld here. A route nested under another page is not separately
 * authorized either — its parent's check is the only one — which mirrors how the application renders the tree.
 */
export function grantablePages(
  routes: readonly AppClientRegisteredRoute[],
  hasPageAncestor: boolean = false,
  group?: string,
): readonly GrantablePage[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader &&
    route.auth === 'required' &&
    route.access === undefined &&
    !hasPageAncestor
      ? [
          {
            name: route.name,
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
      hasPageAncestor || Boolean(route.componentLoader),
      !route.componentLoader && route.navigation ? route.name : group,
    ),
  ]);
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

/**
 * True for a stored page grant no route declares any more. A renamed or removed route leaves such a grant behind, and
 * it silently denies access, so the panel shows it rather than rendering it as an ordinary permission.
 */
export function isUnknownPage(
  options: AuthorizationOptions,
  resource: { readonly type: string; readonly id: string },
): boolean {
  if (resource.type !== PAGE_RESOURCE_TYPE) return false;
  const pages = options.resourceTypes.find(
    (resourceType) => resourceType.value === PAGE_RESOURCE_TYPE,
  );
  return (
    pages !== undefined &&
    !pages.resources.some((page) => page.value === resource.id)
  );
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
