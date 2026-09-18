import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { HubPluginConfig } from '@nocobase/app-plugin-hub/server';
import { hubStoragePath, usesLegacyStorage } from '../storage.js';

const hub: AppConfigFactory<HubPluginConfig> = defineAppConfig((runtime) => ({
  publicHostUrl: '/',
  desiredConfigsDir: usesLegacyStorage(runtime)
    ? undefined
    : runtime.configPaths.storage('hub/desired-configs'),
  logging: {
    deployments: {
      directory: usesLegacyStorage(runtime)
        ? undefined
        : runtime.configPaths.storage('hub/logs/deployments'),
      enabled: true,
      retentionDays: 30,
      maxFileSizeMB: 50,
      maxTotalSizeMB: 1024,
    },
    apps: {
      level: 'info',
      file: {
        enabled: true,
        name: 'app',
        retentionDays: 7,
        maxFileSizeMB: 10,
        maxTotalSizeMB: 500,
      },
      console: { enabled: true, pretty: runtime.env.NODE_ENV !== 'production' },
    },
  },
  artifact: {
    driver: 'fs',
    location: hubStoragePath(runtime, 'apps/artifacts', 'app-artifacts'),
    visibility: 'private',
  },
  host: {
    enabled: true,
    driver: runtime.env.NODE_ENV === 'production' ? 'node' : 'auto',
    ...(usesLegacyStorage(runtime) ||
    runtime.config.get('hub.host.appDeploymentsDir')
      ? { appDeploymentsDir: runtime.configPaths.storage('app-deployments') }
      : { appRevisionsDir: runtime.configPaths.storage('apps/revisions') }),
    appVolumesDir: hubStoragePath(runtime, 'apps/volumes', 'app-volumes'),
    configPath: hubStoragePath(
      runtime,
      'host/runtime/config.yml',
      'hub/host-config.yml',
    ),
    childOutputDir: hubStoragePath(
      runtime,
      'host/logs/child-output',
      'hub/logs/host-output',
    ),
    logging: {
      file: {
        directory: hubStoragePath(runtime, 'host/logs/host', 'host/logs'),
      },
    },
    host: '127.0.0.1',
    startTimeoutMs: 30000,
    ipcTimeoutMs: 300000,
    shutdownTimeoutMs: 30000,
    autoRestart: true,
    maxAutomaticRestarts: 5,
    automaticRestartWindowMs: 60000,
    automaticRestartBaseDelayMs: 250,
  },
}));

export default hub;
