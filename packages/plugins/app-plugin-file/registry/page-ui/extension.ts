import {
  defineClientRouteComponentOverrides,
  defineClientSourceExtension,
  type AppClientSourceExtension,
} from '@nocobase/app-client/plugins';
import { FILE_ROUTE_IDS } from '@nocobase/app-plugin-file/client/route-contracts';

const filePageUiExtension: AppClientSourceExtension =
  defineClientSourceExtension({
    name: 'nocobase-file-page-ui',
    routeComponentOverrides: defineClientRouteComponentOverrides([
      {
        routeId: FILE_ROUTE_IDS.demo,
        componentEntry:
          './client/extensions/nocobase-file-page-ui/pages/file-demo-page',
        componentLoader: () => import('./pages/file-demo-page'),
      },
    ]),
  });

export default filePageUiExtension;
