import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { SpaConfig } from '@nocobase/app-server/spa';
import { existsSync } from 'node:fs';
import path from 'node:path';

const spa: AppConfigFactory<SpaConfig> = defineAppConfig((runtime) => ({
  indexPath: runtime.paths.clientDir
    ? path.join(runtime.paths.clientDir, 'index.html')
    : existsSync(runtime.configPaths.root('client/index.html'))
      ? runtime.configPaths.root('client/index.html')
      : runtime.configPaths.root('dist/client/index.html'),
  runtime: {
    storagePrefix: 'NOCOBASE_',
    storageType: 'localStorage',
    shareToken: false,
  },
}));

export default spa;
