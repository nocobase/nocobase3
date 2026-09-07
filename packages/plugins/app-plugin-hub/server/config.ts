import path from 'node:path';

import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
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
    readonly appDeploymentsDir: string;
    readonly appVolumesDir: string;
    readonly configPath: string;
    readonly host?: string;
    readonly port?: number;
    readonly startTimeoutMs?: number;
    readonly ipcTimeoutMs?: number;
    readonly shutdownTimeoutMs?: number;
    readonly autoRestart?: boolean;
    readonly maxAutomaticRestarts?: number;
    readonly automaticRestartWindowMs?: number;
    readonly automaticRestartBaseDelayMs?: number;
    readonly entrypoint?: string;
    readonly tsxCli?: string;
    readonly tsconfig?: string;
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
        appDeploymentsDir: Type.String(),
        appVolumesDir: Type.String(),
        configPath: Type.String(),
        host: Type.Optional(Type.String({ minLength: 1 })),
        port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
        startTimeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
        ipcTimeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
        shutdownTimeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
        autoRestart: Type.Optional(Type.Boolean()),
        maxAutomaticRestarts: Type.Optional(Type.Integer({ minimum: 0 })),
        automaticRestartWindowMs: Type.Optional(Type.Integer({ minimum: 1 })),
        automaticRestartBaseDelayMs: Type.Optional(
          Type.Integer({ minimum: 0 }),
        ),
        entrypoint: Type.Optional(Type.String({ minLength: 1 })),
        tsxCli: Type.Optional(Type.String({ minLength: 1 })),
        tsconfig: Type.Optional(Type.String({ minLength: 1 })),
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
      appDeploymentsDir: paths.storage('app-deployments'),
      appVolumesDir: paths.storage('app-volumes'),
      configPath: path.join(paths.storage('hub'), 'host-config.yml'),
      host: '127.0.0.1',
      startTimeoutMs: 30000,
      ipcTimeoutMs: 300000,
      shutdownTimeoutMs: 30000,
      autoRestart: true,
      maxAutomaticRestarts: 5,
      automaticRestartWindowMs: 60000,
      automaticRestartBaseDelayMs: 250,
    },
  }),
  envMappings: {
    HUB_HOST_ENABLED: envBoolean('host.enabled'),
    HUB_HOST_DRIVER: envString('host.driver'),
    HUB_HOST_DEPLOYMENTS_DIR: envString('host.appDeploymentsDir'),
    HUB_HOST_VOLUMES_DIR: envString('host.appVolumesDir'),
    HUB_HOST_CONFIG_PATH: envString('host.configPath'),
    HUB_HOST_BIND: envString('host.host'),
    HUB_HOST_PORT: envInteger('host.port'),
    HUB_HOST_START_TIMEOUT_MS: envInteger('host.startTimeoutMs'),
    HUB_HOST_IPC_TIMEOUT_MS: envInteger('host.ipcTimeoutMs'),
    HUB_HOST_SHUTDOWN_TIMEOUT_MS: envInteger('host.shutdownTimeoutMs'),
    HUB_HOST_AUTO_RESTART: envBoolean('host.autoRestart'),
    HUB_HOST_MAX_AUTOMATIC_RESTARTS: envInteger('host.maxAutomaticRestarts'),
    HUB_HOST_AUTOMATIC_RESTART_WINDOW_MS: envInteger(
      'host.automaticRestartWindowMs',
    ),
    HUB_HOST_AUTOMATIC_RESTART_BASE_DELAY_MS: envInteger(
      'host.automaticRestartBaseDelayMs',
    ),
    HUB_HOST_ENTRY: envString('host.entrypoint'),
    HUB_HOST_TSX_CLI: envString('host.tsxCli'),
    HUB_HOST_TSCONFIG: envString('host.tsconfig'),
  },
});
