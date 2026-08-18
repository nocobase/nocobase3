import { existsSync } from 'node:fs';

import { defineConfig } from '@nocobase/app-server/config';
import type { ConfigPaths } from '@nocobase/app-server/config';

export default defineConfig(({ env, paths }) => ({
  indexPath: resolveSpaIndexPath(paths),

  runtime: {
    storagePrefix: env.string('API_CLIENT_STORAGE_PREFIX', 'NOCOBASE_'),
    storageType: env.string('API_CLIENT_STORAGE_TYPE', 'localStorage'),
    shareToken: env.boolean('API_CLIENT_SHARE_TOKEN', false),
  },
}));

function resolveSpaIndexPath(paths: ConfigPaths): string {
  const deploymentIndexPath = paths.root('client/index.html');
  if (existsSync(deploymentIndexPath)) {
    return deploymentIndexPath;
  }

  return paths.root('dist/client/index.html');
}
