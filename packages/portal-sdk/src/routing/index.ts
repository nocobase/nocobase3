import type { ResourceProps } from "@refinedev/core";
import {
  type ComponentType,
  createElement,
  Fragment,
  lazy as reactLazy,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  Suspense,
} from "react";
import { Outlet, Route } from "react-router";

import type { ResourceAcl, RouteAccessConstraint } from "../acl/index.ts";

export * from "./route-surface-context.ts";
export * from "./contextual-navigation.ts";
export * from "./use-route-surface-close.ts";
export * from "./use-route-surface-state.ts";

type ResourceRouteAction = "create" | "edit" | "show";

export type AppRouteLazyModule = {
  default: ComponentType;
};

export type AppRouteLazyLoader = () => Promise<AppRouteLazyModule>;

export type AppRouteResource = Omit<
  ResourceProps,
  "name" | "list" | ResourceRouteAction
>;

type AppRouteContent =
  | {
      element?: ReactNode;
      lazy?: never;
    }
  | {
      element?: never;
      lazy: AppRouteLazyLoader;
    };

type AppRouteBase = AppRouteContent & {
  name: string;
  access?: RouteAccessConstraint;
  outlet?: "auto" | "manual";
};

// The application index redirects to the first accessible menu resource.
// Resource routes therefore need an explicit path and cannot be index routes.
type AppIndexRouteDefinition = AppRouteBase & {
  index: true;
  path?: never;
  children?: never;
  resource?: never;
  resourceAction?: never;
};

type AppPathRouteDefinition = AppRouteBase & {
  index?: false;
  children?: AppRouteDefinition[];
} &
  (
    | {
        path: string;
        resource: AppRouteResource;
        resourceAction?: never;
      }
    | {
        path: string;
        resource?: never;
        resourceAction: ResourceRouteAction;
      }
    | {
        path?: string;
        resource?: never;
        resourceAction?: never;
      }
  );

export type AppRouteDefinition =
  | AppIndexRouteDefinition
  | AppPathRouteDefinition;

export function defineAppRoutes<const Routes extends AppRouteDefinition[]>(
  routes: Routes
) {
  return routes;
}

const joinRoutePath = (parentPath: string, path?: string) => {
  if (!path) return parentPath || "/";
  if (path.startsWith("/")) return path;
  return `${parentPath.replace(/\/$/, "")}/${path}`.replace(/\/+/g, "/");
};

const getResourceActionRoutes = (
  routes: AppRouteDefinition[],
  parentPath: string,
  resourceName: string,
  actions: Partial<Record<ResourceRouteAction, string>> = {}
): Partial<Record<ResourceRouteAction, string>> => {
  for (const route of routes) {
    if (route.resource) continue;
    const fullPath = joinRoutePath(parentPath, route.path);
    if (route.resourceAction) {
      if (actions[route.resourceAction] !== undefined) {
        throw new Error(
          `Resource "${resourceName}" declares multiple ${route.resourceAction} routes.`
        );
      }
      actions[route.resourceAction] = fullPath;
    }
    getResourceActionRoutes(
      route.children ?? [],
      fullPath,
      resourceName,
      actions
    );
  }

  return actions;
};

const getDefaultResourceAcl = (meta?: ResourceProps["meta"]): ResourceAcl =>
  typeof meta?.acl === "undefined"
    ? { type: "authenticated" }
    : (meta.acl as ResourceAcl);

export function buildRouteResources(
  routes: AppRouteDefinition[],
  parentPath = "",
  parentResource?: string,
  inheritedAccess: RouteAccessConstraint[] = []
): ResourceProps[] {
  return routes.flatMap((route) => {
    if (route.resourceAction && !parentResource) {
      throw new Error(
        `Route "${route.name}" declares resourceAction without a parent resource.`
      );
    }

    const fullPath = joinRoutePath(parentPath, route.path);
    const routeAccess = route.access
      ? [...inheritedAccess, route.access]
      : inheritedAccess;
    const resource = route.resource
      ? {
          name: route.name,
          list: fullPath,
          ...getResourceActionRoutes(
            route.children ?? [],
            fullPath,
            route.name
          ),
          ...route.resource,
          meta: {
            ...route.resource.meta,
            parent: route.resource.meta?.parent ?? parentResource,
            acl: getDefaultResourceAcl(route.resource.meta),
            routeAccess: routeAccess.length ? routeAccess : undefined,
          },
        }
      : undefined;
    const childResources = buildRouteResources(
      route.children ?? [],
      fullPath,
      resource ? route.name : parentResource,
      routeAccess
    );

    return resource ? [resource, ...childResources] : childResources;
  });
}

const hasResourceActionRoute = (routes: AppRouteDefinition[]): boolean =>
  routes.some(
    (route) =>
      Boolean(route.resourceAction) ||
      hasResourceActionRoute(route.children ?? [])
  );

export type AppRouteAccessGuard = ComponentType<
  PropsWithChildren<{ access?: RouteAccessConstraint }>
>;

export type RenderAppRoutesOptions = {
  AccessGuard?: AppRouteAccessGuard;
  lazyFallback?: ReactNode;
};

export function renderAppRoutes(
  routes: AppRouteDefinition[],
  options: RenderAppRoutesOptions = {}
): ReactElement[] {
  return routes.map((route) => {
    const routeName = route.name;
    const lazyLoader = route.lazy;
    const eagerElement = route.element;
    if (lazyLoader && eagerElement !== undefined) {
      throw new Error(
        `Route "${routeName}" cannot declare both element and lazy.`
      );
    }
    const routeElement = lazyLoader
      ? createElement(
          Suspense,
          { fallback: options.lazyFallback ?? null },
          createElement(reactLazy(lazyLoader))
        )
      : eagerElement;
    // resourceAction only binds Refine action paths. This provides the mount
    // point that keeps the resource page mounted; the child element still owns
    // whether it renders a drawer, dialog, or other presentation. A specialized
    // layout can opt out and place or consume the outlet itself.
    const content =
      routeElement &&
      route.resource &&
      route.outlet !== "manual" &&
      hasResourceActionRoute(route.children ?? [])
        ? createElement(
            Fragment,
            null,
            routeElement,
            createElement(Outlet)
          )
        : routeElement ?? createElement(Outlet);
    if (route.access && !options.AccessGuard) {
      throw new Error(
        `Route "${route.name}" declares access constraints without an AccessGuard.`
      );
    }
    const element = route.access && options.AccessGuard
      ? createElement(options.AccessGuard, { access: route.access }, content)
      : content;

    return route.index
      ? createElement(Route, {
          key: route.name,
          index: true,
          element,
        })
      : createElement(
          Route,
          {
            key: route.name,
            path: route.path,
            element,
          },
          renderAppRoutes(route.children ?? [], options)
        );
  });
}
