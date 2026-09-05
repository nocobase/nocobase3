import { AppConfig } from '@nocobase/app-server';
import { describe, expect, it } from 'vitest';

import { hubConfig } from '../server/config.js';

// Use fixed paths to exercise the production schema and environment mappings.
const definition = {
  ...hubConfig,
  defaults: {
    artifact: { driver: 'fs', location: '/artifacts', visibility: 'private' },
    host: {
      enabled: true,
      driver: 'node',
      appDeploymentsDir: '/deployments',
      appVolumesDir: '/volumes',
      configPath: '/host-config.yml',
    },
  },
};

describe('Hub host configuration', () => {
  it('loads typed supervisor settings through the config environment layer', async () => {
    const config = new AppConfig([definition], {
      context: {},
      environment: {
        HUB_HOST_PORT: '14010',
        HUB_HOST_BIND: '127.0.0.2',
        HUB_HOST_DEPLOYMENTS_DIR: '/custom/deployments',
        HUB_HOST_VOLUMES_DIR: '/custom/volumes',
        HUB_HOST_START_TIMEOUT_MS: '45000',
        HUB_HOST_AUTO_RESTART: 'false',
        HUB_HOST_MAX_AUTOMATIC_RESTARTS: '0',
        HUB_HOST_TSCONFIG: '/host.tsconfig.json',
        APP_HOST_PORT: '9999',
      },
    });
    await config.loadAll();
    expect(config.get(hubConfig).host).toMatchObject({
      port: 14010,
      host: '127.0.0.2',
      appDeploymentsDir: '/custom/deployments',
      appVolumesDir: '/custom/volumes',
      startTimeoutMs: 45000,
      autoRestart: false,
      maxAutomaticRestarts: 0,
      tsconfig: '/host.tsconfig.json',
    });
  });

  it.each(['0', '65536', '-1'])('rejects invalid ports: %s', async (port) => {
    const config = new AppConfig([definition], {
      context: {},
      environment: { HUB_HOST_PORT: port },
    });
    await expect(config.loadAll()).rejects.toThrow();
  });
});
