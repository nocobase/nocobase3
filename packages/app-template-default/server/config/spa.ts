import { existsSync } from 'node:fs';

import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { ConfigPaths } from '@nocobase/app-server/config';
import type { AppSpaConfig } from './types.js';

const spaConfig: ConfigFactory<AppSpaConfig> = defineConfig(
  ({ env, paths }): AppSpaConfig => ({
    indexPath: resolveSpaIndexPath(paths),

    runtime: {
      storagePrefix: env.string('API_CLIENT_STORAGE_PREFIX', 'NOCOBASE_'),
      storageType: env.string('API_CLIENT_STORAGE_TYPE', 'localStorage'),
      shareToken: env.boolean('API_CLIENT_SHARE_TOKEN', false),
    },
  }),
);

export default spaConfig;

function resolveSpaIndexPath(paths: ConfigPaths): string {
  const deploymentIndexPath = paths.root('client/index.html');
  if (existsSync(deploymentIndexPath)) {
    return deploymentIndexPath;
  }

  return paths.root('dist/client/index.html');
}
