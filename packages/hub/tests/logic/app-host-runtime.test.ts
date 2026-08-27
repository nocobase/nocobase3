// @vitest-environment node

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveHubAppHostSupervisorOptions,
  startHubAppHostRuntime,
  type HubAppHostSupervisor,
} from '../../server/app-host-runtime.ts';

describe('Hub App Host runtime', () => {
  it('uses a managed child and the Hub-owned artifact directory by default', () => {
    expect(resolveHubAppHostSupervisorOptions({}, '/srv/hub')).toEqual({
      enabled: undefined,
      targetUrl: undefined,
      appDistDir: path.join('/srv/hub', 'app-dist'),
      host: undefined,
      port: undefined,
      driver: undefined,
      startTimeoutMs: undefined,
      shutdownTimeoutMs: undefined,
      healthPath: undefined,
      controlToken: undefined,
    });
  });

  it('maps an external App Host to cluster mode and preserves runtime controls', () => {
    expect(
      resolveHubAppHostSupervisorOptions(
        {
          APP_HOST_URL: 'http://app-host.internal:13200',
          APP_HOST_ENABLED: 'true',
          APP_HOST_BIND: '127.0.0.2',
          APP_HOST_PORT: '13200',
          APP_HOST_DRIVER: 'node',
          APP_HOST_START_TIMEOUT_MS: '12000',
          APP_HOST_SHUTDOWN_TIMEOUT_MS: '9000',
          APP_HOST_HEALTH_PATH: '/__health',
          APP_HOST_CONTROL_TOKEN: 'runtime-token',
          APP_DIST_DIR: '/srv/releases',
        },
        '/srv/hub',
      ),
    ).toEqual({
      enabled: true,
      targetUrl: 'http://app-host.internal:13200',
      appDistDir: '/srv/releases',
      host: '127.0.0.2',
      port: 13200,
      driver: 'node',
      startTimeoutMs: 12000,
      shutdownTimeoutMs: 9000,
      healthPath: '/__health',
      controlToken: 'runtime-token',
    });
  });

  it('keeps the old control URL as a compatibility alias', () => {
    const options = resolveHubAppHostSupervisorOptions(
      { APP_HOST_CONTROL_URL: 'http://legacy-app-host:13200' },
      '/srv/hub',
    );

    expect(options.targetUrl).toBe('http://legacy-app-host:13200');
  });

  it('fails closed on invalid process configuration', () => {
    expect(() =>
      resolveHubAppHostSupervisorOptions(
        { APP_HOST_DRIVER: 'docker' },
        '/srv/hub',
      ),
    ).toThrow('APP_HOST_DRIVER must be either node or tsx.');
    expect(() =>
      resolveHubAppHostSupervisorOptions({ APP_HOST_PORT: '0' }, '/srv/hub'),
    ).toThrow('APP_HOST_PORT must be a positive integer.');
  });

  it('holds one supervisor lease and releases it exactly once on close', async () => {
    const release = vi.fn();
    const shutdown = vi.fn(async () => undefined);
    const supervisor: HubAppHostSupervisor = {
      acquire: vi.fn(async () => ({
        targetUrl: new URL('http://127.0.0.1:13200'),
        release,
      })),
      shutdown,
    };
    const runtime = await startHubAppHostRuntime({
      env: {},
      packageRoot: '/srv/hub',
      supervisor,
    });

    expect(runtime.targetUrl.toString()).toBe('http://127.0.0.1:13200/');
    await runtime.close();
    await runtime.close();

    expect(release).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
