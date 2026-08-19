import type { ResourceProps } from "@refinedev/core";
import type { ComponentType, PropsWithChildren } from "react";
import type { AuthenticatorAdapter } from "../auth/index.ts";
import type { AppRouteDefinition } from "../routing/index.ts";

export type AppExtension = {
  id: string;
  priority?: number;
  resources?: ResourceProps[];
  routes?: AppRouteDefinition[];
  dev?: {
    resources?: ResourceProps[];
    routes?: AppRouteDefinition[];
  };
  Provider?: ComponentType<PropsWithChildren>;
  AuthRuntimeProvider?: ComponentType<PropsWithChildren>;
  authRuntimePriority?: number;
  UserMenuItems?: ComponentType;
  HeaderItems?: ComponentType;
  authAdapters?: AuthenticatorAdapter[];
};

export type AppExtensionUserMenuItem = {
  id: string;
  Component: ComponentType;
};

export type AppExtensionHeaderItem = {
  id: string;
  Component: ComponentType;
};

export type AppExtensionContributions = {
  extensions: AppExtension[];
  routeDefinitions: AppRouteDefinition[];
  resources: ResourceProps[];
  userMenuItems: AppExtensionUserMenuItem[];
  headerItems: AppExtensionHeaderItem[];
  authAdapters: AuthenticatorAdapter[];
  providerExtensions: AppExtension[];
  authRuntimeExtensions: AppExtension[];
};

export const sortAppExtensions = (extensions: AppExtension[]): AppExtension[] =>
  [...extensions].sort(
    (left, right) =>
      (left.priority ?? 100) - (right.priority ?? 100) ||
      left.id.localeCompare(right.id)
  );

export const collectAppExtensionContributions = ({
  extensions,
  appRoutes = [],
  registryRoutesEnabled = true,
}: {
  extensions: AppExtension[];
  appRoutes?: AppRouteDefinition[];
  registryRoutesEnabled?: boolean;
}): AppExtensionContributions => {
  const sortedExtensions = sortAppExtensions(extensions);
  const routeExtensions = registryRoutesEnabled ? sortedExtensions : [];

  return {
    extensions: sortedExtensions,
    routeDefinitions: [
      ...appRoutes,
      ...routeExtensions.flatMap((extension) => extension.routes ?? []),
    ],
    resources: routeExtensions.flatMap((extension) => extension.resources ?? []),
    userMenuItems: sortedExtensions
      .filter((extension) => extension.UserMenuItems)
      .map((extension) => ({
        id: extension.id,
        Component: extension.UserMenuItems!,
      })),
    headerItems: sortedExtensions
      .filter((extension) => extension.HeaderItems)
      .map((extension) => ({
        id: extension.id,
        Component: extension.HeaderItems!,
      })),
    authAdapters: sortedExtensions.flatMap(
      (extension) => extension.authAdapters ?? []
    ),
    providerExtensions: sortedExtensions.filter(
      (extension) => extension.Provider
    ),
    authRuntimeExtensions: [...sortedExtensions]
      .filter((extension) => extension.AuthRuntimeProvider)
      .sort(
        (left, right) =>
          (left.authRuntimePriority ?? 100) -
            (right.authRuntimePriority ?? 100) || left.id.localeCompare(right.id)
      ),
  };
};
