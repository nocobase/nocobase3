import type {
  AppPathOptions,
  ResolvedAppScopeRuntime,
} from '@nocobase/app-server/runtime';

/** Host paths are authoritative; standalone storage may be selected by environment. */
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
