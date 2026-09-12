import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { REGISTRY_EXAMPLE_ROUTE_IDS } from '@nocobase/app-plugin-registry-example/client/route-contracts';

const registryExamplePageUiExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-registry-example-page-ui',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: REGISTRY_EXAMPLE_ROUTE_IDS.index,
        componentEntry:
          './client/extensions/nocobase-registry-example-page-ui/pages/registry-example-page',
        componentLoader: () => import('./pages/registry-example-page'),
      },
    ]),
  });

export default registryExamplePageUiExtension;
