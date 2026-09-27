import type {
  AppPathOptions,
  ResolvedAppScopeRuntime,
} from '@nocobase/app-server/runtime';

/**
 * Host paths are authoritative. A standalone Hub takes its storage from `APP_STORAGE_DIR`, which the runtime has already
 * applied by the time this runs; `HUB_STORAGE_DIR` is the name earlier Hub releases documented and is still read when
 * `APP_STORAGE_DIR` is not set.
 */
export function resolveHubPaths(
  runtime: ResolvedAppScopeRuntime,
): AppPathOptions {
  if (runtime.mode === 'embedded' || runtime.paths.storageDir !== undefined)
    return runtime.paths;
  return {
    ...runtime.paths,
    storageDir: runtime.env.HUB_STORAGE_DIR || undefined,
  };
}
