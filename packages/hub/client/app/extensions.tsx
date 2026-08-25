import { Suspense, type PropsWithChildren, type ReactNode } from 'react';
import {
  collectAppExtensionContributions,
  type AppExtension,
} from '@nocobase/app-portal-sdk/extensions';
import {
  buildRouteResources,
  renderAppRoutes,
} from '@nocobase/app-portal-sdk/routing';
import { LoadingState } from '@/components/app-shell/loading-state';
import { appRoutes, registryRoutesEnabled } from '@/routes';
import { createDevelopmentRoute } from './development';
import { RouteAccessGuard } from './route-access-guard';

const extensionModules = import.meta.glob<{ default: AppExtension }>(
  '@/extensions/*/extension.tsx',
  { eager: true },
);

const discoveredExtensions = Object.values(extensionModules).map(
  (module) => module.default,
);

// The Hub authenticates against its local Better Auth runtime. Keep Registry
// discovery and development showcases, but do not mount providers that require
// a remote NocoBase token, ACL, or data backend in the Hub shell.
const backendNeutralRuntimeExtensionIds = new Set([
  'nocobase-client',
  'nocobase-error-boundary',
  'nocobase-route-surfaces',
]);

const extensionContributions = collectAppExtensionContributions({
  extensions: discoveredExtensions,
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
  },
);

export const extensionStandaloneRouteElements = import.meta.env.DEV
  ? [createDevelopmentRoute(appExtensions)]
  : [];

export const extensionUserMenuItems =
  extensionContributions.userMenuItems.filter((item) =>
    backendNeutralRuntimeExtensionIds.has(item.id),
  );

export const extensionAuthAdapters = extensionContributions.authAdapters;

export function AppExtensionProviders({ children }: PropsWithChildren) {
  const extensions = extensionContributions.providerExtensions.filter(
    (extension) => backendNeutralRuntimeExtensionIds.has(extension.id),
  );

  return extensions.reduceRight<ReactNode>((content, extension) => {
    const Provider = extension.Provider;
    return Provider ? <Provider>{content}</Provider> : content;
  }, children);
}

export function AppAuthRuntimeProviders({ children }: PropsWithChildren) {
  const extensions = extensionContributions.authRuntimeExtensions.filter(
    (extension) => backendNeutralRuntimeExtensionIds.has(extension.id),
  );

  return extensions.reduceRight<ReactNode>((content, extension) => {
    const Provider = extension.AuthRuntimeProvider!;
    return (
      <Suspense fallback={<LoadingState fullscreen />}>
        <Provider>{content}</Provider>
      </Suspense>
    );
  }, children);
}
