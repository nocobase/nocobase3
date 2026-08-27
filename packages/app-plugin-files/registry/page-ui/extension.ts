import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { FILES_ROUTE_IDS } from '@nocobase/app-plugin-files/client/route-contracts';

const filesPageUiExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-files-page-ui',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: FILES_ROUTE_IDS.demo,
        componentEntry:
          './client/extensions/nocobase-files-page-ui/pages/files-demo-page',
        componentLoader: () => import('./pages/files-demo-page'),
      },
    ]),
  });

export default filesPageUiExtension;
