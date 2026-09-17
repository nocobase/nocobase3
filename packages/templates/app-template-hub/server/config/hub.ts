import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { HubPluginConfig } from '@nocobase/app-plugin-hub/server';
import path from 'node:path';

const hub: AppConfigFactory<HubPluginConfig> = defineAppConfig((runtime) => ({
  publicHostUrl: '/',
  logging: {
    deployments: {
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
      console: { enabled: true, pretty: false },
    },
  },
  artifact: {
    driver: 'fs',
    location: runtime.configPaths.storage('app-artifacts'),
    visibility: 'private',
  },
  host: {
    enabled: true,
    driver: runtime.env.NODE_ENV === 'production' ? 'node' : 'auto',
    appDeploymentsDir: runtime.configPaths.storage('app-deployments'),
    appVolumesDir: runtime.configPaths.storage('app-volumes'),
    configPath: path.join(
      runtime.configPaths.storage('hub'),
      'host-config.yml',
    ),
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
