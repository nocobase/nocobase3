import path from 'node:path';

import {
  defineAppConfig,
  envBoolean,
  type AppConfigDefinition,
  type ResolvedAppRuntimeConfigContext,
} from '@nocobase/app-server';
import type { AppDriveDiskConfig } from '@nocobase/drive';
import { Type } from '@sinclair/typebox';

export interface HubPluginConfig {
  readonly artifact: AppDriveDiskConfig;
  readonly host: {
    readonly enabled: boolean;
    readonly driver: 'node' | 'tsx';
    readonly deploymentsDir: string;
    readonly volumesDir: string;
    readonly configPath: string;
  };
}

export const hubConfig: AppConfigDefinition<
  HubPluginConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'hub',
  schema: Type.Object(
    {
      artifact: Type.Unsafe<AppDriveDiskConfig>({
        type: 'object',
        additionalProperties: true,
      }),
      host: Type.Object({
        enabled: Type.Boolean(),
        driver: Type.Union([Type.Literal('node'), Type.Literal('tsx')]),
        deploymentsDir: Type.String(),
        volumesDir: Type.String(),
        configPath: Type.String(),
      }),
    },
    { additionalProperties: false },
  ),
  defaults: ({ paths }: ResolvedAppRuntimeConfigContext): HubPluginConfig => ({
    artifact: {
      driver: 'fs',
      location: paths.storage('app-artifacts'),
      visibility: 'private',
    },
    host: {
      enabled: true,
      driver: process.env.NODE_ENV === 'production' ? 'node' : 'tsx',
      deploymentsDir: paths.storage('app-deployments'),
      volumesDir: paths.storage('app-volumes'),
      configPath: path.join(paths.storage('hub'), 'host-config.yml'),
    },
  }),
  envMappings: {
    HUB_HOST_ENABLED: envBoolean('host.enabled'),
  },
});
