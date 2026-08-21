import { defineAppRoutes } from '@nocobase/portal-sdk/routing';
import { Activity, Boxes } from 'lucide-react';
import type { ComponentType } from 'react';

import { HubCapabilityRouteGate } from '@/features/hub/provider';

// Set this to false when the application no longer needs the example routes
// contributed by installed Registry extensions. Providers, adapters, and the
// development showcase under /dev remain available.
export const registryRoutesEnabled = false;

// Add application-owned business routes here. Installed Registry extensions
// contribute their own route definitions through the same runtime. Add a
// resource entry when a route should also appear in navigation.
export const appRoutes = defineAppRoutes([
  {
    name: 'apps',
    path: '/apps',
    lazy: () =>
      import('@/pages/applications/list').then(withCapability('hub.app')),
    resource: {
      meta: {
        label: 'Applications',
        singularLabel: 'Application',
        description: 'Applications and their active releases.',
        descriptionI18nKey: 'hub.resources.applications.description',
        i18nKey: 'hub.resources.applications.label',
        i18nSingularKey: 'hub.resources.applications.singular',
        icon: <Boxes />,
        priority: 10,
        hubResource: 'hub.app',
      },
    },
  },
  {
    name: 'apps.detail',
    path: '/apps/:appId',
    lazy: () =>
      import('@/pages/applications/detail').then(
        withCapability('hub.app', { applicationParam: 'appId' }),
      ),
  },
  {
    name: 'deployments',
    path: '/deployments',
    lazy: () =>
      import('@/pages/deployments/list').then(
        withCapability('hub.deployment', { allowAnyApplication: true }),
      ),
    resource: {
      meta: {
        label: 'Deployments',
        singularLabel: 'Deployment',
        description: 'Deployment and rollback operation history.',
        descriptionI18nKey: 'hub.resources.deployments.description',
        i18nKey: 'hub.resources.deployments.label',
        i18nSingularKey: 'hub.resources.deployments.singular',
        icon: <Activity />,
        priority: 20,
        hubResource: 'hub.deployment',
      },
    },
  },
  {
    name: 'deployments.detail',
    path: '/deployments/:deploymentId',
    lazy: () =>
      import('@/pages/deployments/detail').then(
        withCapability('hub.deployment', { allowAnyApplication: true }),
      ),
  },
]);

function withCapability(
  resource: string,
  options: { applicationParam?: string; allowAnyApplication?: boolean } = {},
) {
  return (module: { default: ComponentType }) => {
    const Page = module.default;
    return {
      default: function HubCapabilityRoute() {
        return (
          <HubCapabilityRouteGate
            resource={resource}
            action='read'
            applicationParam={options.applicationParam}
            allowAnyApplication={options.allowAnyApplication}
          >
            <Page />
          </HubCapabilityRouteGate>
        );
      },
    };
  };
}
