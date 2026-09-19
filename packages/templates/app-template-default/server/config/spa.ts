import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { SpaConfig } from '@nocobase/app-server/spa';

const spa: AppConfigFactory<SpaConfig> = defineAppConfig(({ paths }) => ({
  indexPath: paths.client('index.html'),
  runtime: {
    storagePrefix: 'NOCOBASE_',
    storageType: 'localStorage',
    shareToken: false,
  },
}));

export default spa;
