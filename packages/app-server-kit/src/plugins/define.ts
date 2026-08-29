import type { AppConfigDefinition } from '../config/index.js';
import type {
  AppServerPlugin,
  AppServerPluginDefinition,
  AppServerPlugins,
} from './types.js';

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

export function defineServerPlugin(
  definition: AppServerPluginDefinition,
): AppServerPlugin {
  const packageName = normalizePackageName(definition.packageName);

  return Object.freeze({
    packageName,
    config: Object.freeze(normalizeConfigDefinitions(definition.config)),
    providers: Object.freeze([...(definition.providers ?? [])]),
    apiRoutes: Object.freeze([...(definition.apiRoutes ?? [])]),
    rootRoutes: Object.freeze([...(definition.rootRoutes ?? [])]),
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

export function defineServerPlugins(
  plugins: readonly AppServerPlugin[],
): AppServerPlugins {
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

function normalizeConfigDefinitions(
  value:
    | AppConfigDefinition<unknown, never>
    | readonly AppConfigDefinition<unknown, never>[]
    | undefined,
): readonly AppConfigDefinition<unknown, never>[] {
  if (value === undefined) return [];
  return isConfigDefinitionArray(value) ? [...value] : [value];
}

function isConfigDefinitionArray(
  value:
    | AppConfigDefinition<unknown, never>
    | readonly AppConfigDefinition<unknown, never>[],
): value is readonly AppConfigDefinition<unknown, never>[] {
  return Array.isArray(value);
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
