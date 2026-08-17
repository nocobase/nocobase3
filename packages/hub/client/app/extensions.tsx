import {
  Suspense,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  collectAppExtensionContributions,
  type AppExtension,
} from "@nocobase/portal-sdk/extensions";
import {
  buildRouteResources,
  renderAppRoutes,
} from "@nocobase/portal-sdk/routing";
import { LoadingState } from "@/components/app-shell/loading-state";
import { appRoutes, registryRoutesEnabled } from "@/routes";
import { createDevelopmentRoute } from "./development";
import { RouteAccessGuard } from "./route-access-guard";

const extensionModules = import.meta.glob<{ default: AppExtension }>(
  "@/extensions/*/extension.tsx",
  { eager: true }
);

const extensionContributions = collectAppExtensionContributions({
  extensions: Object.values(extensionModules).map((module) => module.default),
  appRoutes,
  registryRoutesEnabled,
});

export const appExtensions = extensionContributions.extensions;

export const configuredResources = [
  ...buildRouteResources(extensionContributions.routeDefinitions),
  ...extensionContributions.resources,
];

export const configuredRouteElements = renderAppRoutes(
  extensionContributions.routeDefinitions,
  {
    AccessGuard: RouteAccessGuard,
  }
);

export const extensionStandaloneRouteElements = import.meta.env.DEV
  ? [createDevelopmentRoute(appExtensions)]
  : [];

export const extensionUserMenuItems = extensionContributions.userMenuItems;

export const extensionAuthAdapters = extensionContributions.authAdapters;

export function AppExtensionProviders({ children }: PropsWithChildren) {
  return extensionContributions.providerExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.Provider;
      return Provider ? <Provider>{content}</Provider> : content;
    },
    children
  );
}

export function AppAuthRuntimeProviders({ children }: PropsWithChildren) {
  return extensionContributions.authRuntimeExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.AuthRuntimeProvider!;
      return (
        <Suspense fallback={<LoadingState fullscreen />}>
          <Provider>{content}</Provider>
        </Suspense>
      );
    },
    children
  );
}
