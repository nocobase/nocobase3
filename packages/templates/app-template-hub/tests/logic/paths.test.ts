// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppPaths,
  resolveAppScopeRuntime,
} from '@nocobase/app-server/runtime';
import { resolveStandaloneAppPaths } from '@nocobase/app-server/node';
import { resolveHubPaths } from '../../server/paths.js';

function storage(
  mode: 'standalone' | 'embedded',
  rootDir: string,
  deploymentRootDir: string,
  storageDir?: string,
  configured?: string,
): string {
  const input = resolveStandaloneAppPaths({ rootDir, deploymentRootDir });
  const runtime = resolveAppScopeRuntime({
    id: 'hub',
    basePath: '/hub',
    mode,
    paths: { ...input, storageDir },
    env: { HUB_STORAGE_DIR: configured },
    registerDisposer() {},
  });
  return createAppPaths(resolveHubPaths(runtime)).storage();
}

describe('Hub persistent paths', () => {
  it('shares storage between source and a compiled directory of any name', () => {
    expect(storage('standalone', '/srv/hub', '.')).toBe('/srv/hub/storage');
    expect(storage('standalone', '/srv/hub/build', '..')).toBe(
      '/srv/hub/storage',
    );
  });
  it('resolves environment paths from deployment root and prefers explicit storage', () => {
    expect(
      storage('standalone', '/srv/hub/build', '..', undefined, 'data'),
    ).toBe('/srv/hub/data');
    expect(
      storage('standalone', '/srv/hub/build', '..', undefined, '/external'),
    ).toBe('/external');
    expect(
      storage('standalone', '/srv/hub/build', '..', 'chosen', '/ignored'),
    ).toBe('/srv/hub/chosen');
  });
  it('keeps the Host volume in embedded mode', () => {
    expect(
      storage('embedded', '/srv/release', '.', '/volumes/hub', '/ignored'),
    ).toBe('/volumes/hub');
  });
});
