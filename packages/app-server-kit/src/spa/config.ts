import { existsSync } from 'node:fs';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import {
  envBoolean,
  envString,
  type EnvironmentMapping,
} from '@nocobase/config/providers/env';

import { defineAppConfig, type AppConfigDefinition } from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export interface SpaConfig {
  readonly indexPath: string;
  readonly viteDevUrl?: string | null;
  readonly runtime: {
    readonly storagePrefix: string;
    readonly storageType: string;
    readonly shareToken: boolean;
  };
}

export const spaConfig: AppConfigDefinition<
  SpaConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig<SpaConfig>()({
  namespace: 'spa',
  schema: Type.Object({
    indexPath: Type.String(),
    runtime: Type.Object({
      storagePrefix: Type.String(),
      storageType: Type.String(),
      shareToken: Type.Boolean(),
    }),
    viteDevUrl: Type.Optional(
      Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
    ),
  }),
  defaults: ({ paths, runtimePaths }: ResolvedAppRuntimeConfigContext) => ({
    indexPath: resolveSpaIndexPath(paths, runtimePaths.clientDir),
    runtime: {
      storagePrefix: 'NOCOBASE_',
      storageType: 'localStorage',
      shareToken: false,
    },
  }),
  envMappings: {
    API_CLIENT_STORAGE_PREFIX: envString('runtime.storagePrefix'),
    API_CLIENT_STORAGE_TYPE: envString('runtime.storageType'),
    API_CLIENT_SHARE_TOKEN: envBoolean('runtime.shareToken'),
    APP_VITE_DEV_URL: optionalUrlEnvironment('viteDevUrl'),
  },
});

function resolveSpaIndexPath(
  paths: ResolvedAppRuntimeConfigContext['paths'],
  clientDir: string | undefined,
): string {
  if (clientDir) return path.join(clientDir, 'index.html');
  const deployment = paths.root('client/index.html');
  return existsSync(deployment)
    ? deployment
    : paths.root('dist/client/index.html');
}

function optionalUrlEnvironment(path: string): EnvironmentMapping {
  return {
    path,
    parse: (value): string | null =>
      value === 'false' || value === '0' ? null : value,
  };
}
