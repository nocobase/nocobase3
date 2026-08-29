import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from '@nocobase/app-server-kit/config';
import { createMountedOriginProxyHandler } from '@nocobase/app-server-kit/proxy';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import { createNocoBaseSpaRuntimeGlobals } from '@nocobase/app-server-kit/spa';
import { joinBasePath } from '@nocobase/app-server-kit/support';
import type {
  AppConfig,
  AppSpaConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';
import { resolveViteDevUrl } from './server.js';

const spaConfig: AppRuntimeConfigFactory<
  AppSpaConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppSpaConfig, DefaultAppConfigContext>(
  ({ env, mode, paths, routing, runtimePaths, scopeConfig }): AppSpaConfig => {
    const storagePrefix =
      scopeConfig?.apiClientStoragePrefix ??
      env.string('API_CLIENT_STORAGE_PREFIX', 'NOCOBASE_');
    const storageType =
      scopeConfig?.apiClientStorageType ??
      env.string('API_CLIENT_STORAGE_TYPE', 'localStorage');
    const shareToken =
      scopeConfig?.apiClientShareToken ??
      env.boolean('API_CLIENT_SHARE_TOKEN', false);
    const publicBasePath = routing?.publicBasePath ?? '/main';
    const viteDevUrl = mode === 'embedded' ? undefined : resolveViteDevUrl(env);
    const publicApiUrl = joinBasePath(publicBasePath, '/api');

    return {
      indexPath: resolveSpaIndexPath(paths, runtimePaths),
      handler: viteDevUrl
        ? createMountedOriginProxyHandler(viteDevUrl, {
            publicBasePath,
            unavailableMessage: 'Vite dev server is unavailable.',
          })
        : undefined,
      runtimeGlobals: createNocoBaseSpaRuntimeGlobals({
        appBasePath: publicBasePath,
        apiUrl: publicApiUrl,
        storagePrefix,
        storageType,
        shareToken,
      }),
      runtime: {
        storagePrefix,
        storageType,
        shareToken,
      },
    };
  },
);

export default spaConfig;

function resolveSpaIndexPath(
  paths: DefaultAppConfigContext['paths'],
  runtimePaths: DefaultAppConfigContext['runtimePaths'],
): string {
  if (runtimePaths?.clientDir) {
    return path.join(runtimePaths.clientDir, 'index.html');
  }

  const deploymentIndexPath = paths.root('client/index.html');
  return existsSync(deploymentIndexPath)
    ? deploymentIndexPath
    : paths.root('dist/client/index.html');
}
