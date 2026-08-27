import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { FILES_ROUTE_IDS } from '@nocobase/app-plugin-files/client/route-contracts';

const filesDemoPageUiExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-files-demo-page-ui',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: FILES_ROUTE_IDS.demo,
        componentEntry:
          './client/extensions/nocobase-files-demo-page-ui/pages/files-demo-page',
        componentLoader: () => import('./pages/files-demo-page'),
      },
    ]),
  });

export default filesDemoPageUiExtension;
