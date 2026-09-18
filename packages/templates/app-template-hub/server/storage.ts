import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ResolvedAppRuntime } from '@nocobase/app-server/runtime';

/** New installations use v2; existing installations stay on their old layout until migrated. */
export function usesLegacyStorage(runtime: ResolvedAppRuntime): boolean {
  const configured = runtime.config.get<string>('hub.storageLayout');
  if (
    configured !== undefined &&
    configured !== 'legacy' &&
    configured !== 'v2'
  )
    throw new Error('hub.storageLayout must be legacy or v2');
  if (configured) return configured === 'legacy';
  if (runtime.config.get('hub.host.appRevisionsDir')) return false;
  if (runtime.config.get('hub.host.appDeploymentsDir')) return true;
  if (
    existsSync(runtime.configPaths.storage()) &&
    readdirSync(runtime.configPaths.storage()).some((name) =>
      /\.sqlite(?:3)?$/.test(name),
    )
  )
    return true;
  return [
    'app-deployments',
    'app-volumes',
    'app-artifacts',
    'hub/host-config.yml',
    'database.sqlite',
  ].some((entry) => existsSync(runtime.configPaths.storage(entry)));
}

export function hubStoragePath(
  runtime: ResolvedAppRuntime,
  current: string,
  legacy: string,
): string {
  return runtime.configPaths.storage(
    usesLegacyStorage(runtime) ? legacy : current,
  );
}

export function stableHubStorageRoot(
  rootDir: string,
  storageDir?: string,
  configured?: string,
): string {
  const deploymentRoot =
    path.basename(rootDir) === 'dist' ? path.dirname(rootDir) : rootDir;
  if (configured) return path.resolve(deploymentRoot, configured);
  if (storageDir && path.resolve(storageDir) !== path.join(rootDir, 'storage'))
    return storageDir;
  const oldBuiltStorage = path.join(rootDir, 'storage');
  if (
    path.basename(rootDir) === 'dist' &&
    existsSync(oldBuiltStorage) &&
    !existsSync(
      path.join(deploymentRoot, 'storage/hub/storage-migration/completed'),
    )
  )
    throw new Error(
      'Legacy dist/storage exists. Move it outside dist with the offline storage migration before starting the Hub.',
    );
  return path.join(deploymentRoot, 'storage');
}
