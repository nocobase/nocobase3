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
        routeId: FILES_ROUTE_IDS.index,
        componentEntry:
          './client/extensions/nocobase-files-page-ui/pages/files-page',
        componentLoader: () => import('./pages/files-page'),
      },
    ]),
  });

export default filesPageUiExtension;
