// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '@nocobase/app-server-kit/runtime';

import type { AppConfig } from '../../server/config/index.ts';
import { createRealtimeService } from '../../server/realtime/service.ts';
import {
  createAppDeps,
  disposeAppDeps,
  type AppDeps,
} from '../../server/runtime/deps.ts';
import { onceAsync } from '../../server/runtime/disposers.ts';
import { createAppServices } from '../../server/services/index.ts';
import { createStandaloneRuntime } from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const runtimes: Array<AppRuntime<AppConfig>> = [];
const dependencies: AppDeps[] = [];

afterEach(async () => {
  await Promise.all(dependencies.splice(0).map(disposeAppDeps));
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

describe('Files app composition', () => {
  it('shares one runtime with the application FileService', () => {
    const runtime = trackRuntime(createStandaloneRuntime());
    const deps = trackDeps(createAppDeps(runtime));
    const realtime = createRealtimeService();
    const services = createAppServices(runtime, deps, { realtime });

    expect(deps.filesRuntime).toBeDefined();
    expect(services.fileService).toBeDefined();

    realtime.close();
  });

  it('does not initialize Files runtime or service when the plugin is disabled', () => {
    const enabledRuntime = trackRuntime(createStandaloneRuntime());
    const runtime: AppRuntime<AppConfig> = {
      ...enabledRuntime,
      config: {
        ...enabledRuntime.config,
        plugins: enabledRuntime.config.plugins.map((plugin) =>
          plugin.packageName === '@nocobase/app-plugin-files'
            ? { ...plugin, enabled: false }
            : plugin,
        ),
      },
    };
    const deps = trackDeps(createAppDeps(runtime));
    const realtime = createRealtimeService();
    const services = createAppServices(runtime, deps, { realtime });

    expect(deps.filesRuntime).toBeUndefined();
    expect(services.fileService).toBeUndefined();
    realtime.close();
  });

  it('disposes the shared Files runtime once through the app lifecycle guard', async () => {
    const runtime = trackRuntime(createStandaloneRuntime());
    const deps = trackDeps(createAppDeps(runtime));
    const filesRuntime = deps.filesRuntime;
    expect(filesRuntime).toBeDefined();
    if (!filesRuntime) {
      throw new Error('Expected Files runtime to be initialized.');
    }
    const disposeSpy = vi.spyOn(filesRuntime, 'dispose');
    const dispose = onceAsync(() => disposeAppDeps(deps));

    await dispose();
    await dispose();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    dependencies.splice(dependencies.indexOf(deps), 1);
  });
});

function trackRuntime(runtime: AppRuntime<AppConfig>): AppRuntime<AppConfig> {
  runtimes.push(runtime);
  return runtime;
}

function trackDeps(deps: AppDeps): AppDeps {
  dependencies.push(deps);
  return deps;
}
