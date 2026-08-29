import type { ApplicationConfig } from '../application/index.js';
import type {
  AppServerPlugin,
  AppServerPluginDefinition,
  AppServerPlugins,
} from './types.js';

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

export function defineServerPlugin<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(definition: AppServerPluginDefinition<TConfig>): AppServerPlugin<TConfig> {
  const packageName = normalizePackageName(definition.packageName);

  return Object.freeze({
    packageName,
    providers: Object.freeze([...(definition.providers ?? [])]),
    routes: Object.freeze([...(definition.routes ?? [])]),
    database: definition.database
      ? Object.freeze({ ...definition.database })
      : undefined,
    queue: definition.queue
      ? Object.freeze({
          ...definition.queue,
          jobs: definition.queue.jobs
            ? Object.freeze([...definition.queue.jobs])
            : undefined,
        })
      : undefined,
  });
}

export function defineServerPlugins<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(plugins: readonly AppServerPlugin<TConfig>[]): AppServerPlugins<TConfig> {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.packageName)) {
      throw new Error(
        `Server plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seen.add(plugin.packageName);
  }

  return Object.freeze({ plugins: Object.freeze([...plugins]) });
}

function normalizePackageName(packageName: string): string {
  const normalized = packageName.trim();
  if (!PACKAGE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Server plugin package name "${packageName}" must be a valid scoped package name.`,
    );
  }
  return normalized;
}
