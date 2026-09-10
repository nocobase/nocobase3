// @vitest-environment node
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { fileURLToPath } from 'node:url';
import appRuntime from '../../server/runtime.js';
import { describe, expect, it } from 'vitest';

import { type HubPluginConfig } from '@nocobase/app-plugin-hub/server';

describe('Hub host configuration', () => {
  it('loads typed supervisor settings through the config environment layer', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: fileURLToPath(new URL('../..', import.meta.url)),
      env: {},
    });
    const config = runtime.config;
    expect(config.get<HubPluginConfig>('hub')!.host).toMatchObject({
      enabled: true,
      host: '127.0.0.1',
      startTimeoutMs: 30000,
      autoRestart: true,
      maxAutomaticRestarts: 5,
    });
  });
});
